import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { localized } from "@/lib/localized";
import { carModelSchema } from "@/lib/validation/fleet";
import { parseInput } from "@/lib/validation/parse";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { violatedConstraint } from "@/server/db-errors";
import { storePublicModelImage } from "@/server/documents/images";
import { storage } from "@/server/storage";

/** Katalogmodeller med antal biler (F8-agtig liste, 04-sitemap /admin/fleet/models). */
export async function listModels(ctx: PolicyContext) {
  assertCan(ctx, "fleet:read");
  const models = await db.carModel.findMany({
    orderBy: [{ brand: "asc" }, { model: "asc" }, { year: "desc" }],
    select: {
      id: true,
      slug: true,
      brand: true,
      model: true,
      year: true,
      isActive: true,
      isFeatured: true,
      category: { select: { nameI18n: true } },
      _count: { select: { cars: { where: { opStatus: { not: "RETIRED" } } } } },
    },
  });
  return models.map(({ category, _count, ...model }) => ({
    ...model,
    category: localized(category.nameI18n, "da"),
    cars: _count.cars,
  }));
}

/** Én model til redigering. Beskrivelser pr. sprog pakkes ud til formularens felter. */
export async function adminModel(ctx: PolicyContext, modelId: string) {
  assertCan(ctx, "fleet:read");
  if (!z.uuid().safeParse(modelId).success) throw new AppError("NOT_FOUND", "Modellen findes ikke");
  const model = await db.carModel.findUnique({
    where: { id: modelId },
    include: { images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  });
  if (!model) throw new AppError("NOT_FOUND", "Modellen findes ikke");
  const texts = (model.descriptionI18n ?? {}) as Record<string, string | undefined>;
  return {
    ...model,
    descriptions: {
      da: texts.da ?? "",
      en: texts.en ?? "",
      ar: texts.ar ?? "",
      fr: texts.fr ?? "",
    },
  };
}

export async function modelFormOptions(ctx: PolicyContext) {
  assertCan(ctx, "fleet:read");
  const categories = await db.carCategory.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, nameI18n: true },
  });
  return {
    categories: categories.map((category) => ({
      id: category.id,
      name: localized(category.nameI18n, "da"),
    })),
  };
}

function modelData(values: ReturnType<typeof carModelSchema.parse>) {
  const descriptions = Object.fromEntries(
    (
      [
        ["da", values.descriptionDa],
        ["en", values.descriptionEn],
        ["ar", values.descriptionAr],
        ["fr", values.descriptionFr],
      ] as const
    ).filter(([, text]) => text),
  );
  return {
    categoryId: values.categoryId,
    slug: values.slug,
    brand: values.brand,
    model: values.model,
    year: values.year,
    transmission: values.transmission,
    fuel: values.fuel,
    seats: values.seats,
    bags: values.bags,
    doors: values.doors,
    airConditioning: values.airConditioning,
    includedKmPerDay: values.includedKmPerDay,
    extraKmFeeMinor: values.extraKmFee,
    depositMinor: values.deposit,
    descriptionI18n: descriptions,
    isActive: values.isActive,
    isFeatured: values.isFeatured,
  };
}

function duplicateSlug(error: unknown): never {
  if (violatedConstraint(error) === "CarModel_slug_key") {
    throw new AppError("VALIDATION_FAILED", "Adressen bruges allerede", {
      fields: ["slug"],
      reason: "DUPLICATE",
    });
  }
  throw error;
}

async function assertCategory(categoryId: string) {
  const exists = await db.carCategory.count({ where: { id: categoryId } });
  if (!exists) {
    throw new AppError("VALIDATION_FAILED", "Kategorien findes ikke", { fields: ["categoryId"] });
  }
}

/** Ny katalogmodel (MANAGER+). Priser sættes pr. kategori i M13; modellen arver dem. */
export async function createModel(ctx: PolicyContext, input: Record<string, unknown>) {
  assertCan(ctx, "catalog:write");
  const data = modelData(parseInput(carModelSchema, input));
  await assertCategory(data.categoryId);
  try {
    return await db.$transaction(async (tx) => {
      const model = await tx.carModel.create({ data, select: { id: true } });
      await audit(tx, {
        actorUserId: ctx.actor!.userId,
        action: "carModel.create",
        entityType: "CarModel",
        entityId: model.id,
        diff: { slug: data.slug },
      });
      return model;
    });
  } catch (error) {
    duplicateSlug(error);
  }
}

/**
 * Ret en model (MANAGER+). Eksisterende bookinger har deres egen pris og depositum, så en
 * ændring påvirker kun nye bookinger. En inaktiv model vises ikke i kataloget.
 */
export async function updateModel(
  ctx: PolicyContext,
  modelId: string,
  input: Record<string, unknown>,
) {
  assertCan(ctx, "catalog:write");
  if (!z.uuid().safeParse(modelId).success) throw new AppError("NOT_FOUND", "Modellen findes ikke");
  const data = modelData(parseInput(carModelSchema, input));
  const model = await db.carModel.findUnique({ where: { id: modelId } });
  if (!model) throw new AppError("NOT_FOUND", "Modellen findes ikke");
  await assertCategory(data.categoryId);
  const changed = (Object.keys(data) as (keyof typeof data)[]).filter(
    (key) => JSON.stringify(data[key] ?? null) !== JSON.stringify(model[key] ?? null),
  );
  try {
    await db.$transaction(async (tx) => {
      await tx.carModel.update({ where: { id: modelId }, data });
      await audit(tx, {
        actorUserId: ctx.actor!.userId,
        action: "carModel.update",
        entityType: "CarModel",
        entityId: modelId,
        diff: { fields: changed },
      });
    });
  } catch (error) {
    duplicateSlug(error);
  }
}

/** Højst så mange billeder pr. model; kataloget viser det første. */
export const MAX_MODEL_IMAGES = 8;

/** Billede til kataloget (MANAGER+). Renses for metadata og gemmes offentligt. */
export async function addModelImage(ctx: PolicyContext, modelId: string, bytes: Uint8Array) {
  assertCan(ctx, "catalog:write");
  if (!z.uuid().safeParse(modelId).success) throw new AppError("NOT_FOUND", "Modellen findes ikke");
  const model = await db.carModel.findUnique({
    where: { id: modelId },
    select: { brand: true, model: true, _count: { select: { images: true } } },
  });
  if (!model) throw new AppError("NOT_FOUND", "Modellen findes ikke");
  if (model._count.images >= MAX_MODEL_IMAGES) {
    throw new AppError("CONFLICT", "Modellen har allerede det største antal billeder", {
      reason: "TOO_MANY",
    });
  }
  const storageKey = await storePublicModelImage(modelId, bytes);
  const name = `${model.brand} ${model.model}`;
  try {
    return await db.$transaction(async (tx) => {
      const image = await tx.carImage.create({
        data: {
          carModelId: modelId,
          storageKey,
          altI18n: { da: name, en: name, ar: name, fr: name },
          sortOrder: model._count.images,
        },
        select: { id: true },
      });
      await audit(tx, {
        actorUserId: ctx.actor!.userId,
        action: "carModel.image.add",
        entityType: "CarModel",
        entityId: modelId,
        diff: { imageId: image.id },
      });
      return image;
    });
  } catch (error) {
    await storage()
      .delete(storageKey)
      .catch(() => undefined);
    throw error;
  }
}

/** Fjern et billede (MANAGER+). Det første tilbageværende bliver forsidebillede. */
export async function deleteModelImage(ctx: PolicyContext, imageId: string) {
  assertCan(ctx, "catalog:write");
  if (!z.uuid().safeParse(imageId).success) throw new AppError("NOT_FOUND", "Billedet findes ikke");
  const image = await db.$transaction(async (tx) => {
    const found = await tx.carImage.findUnique({ where: { id: imageId } });
    if (!found) throw new AppError("NOT_FOUND", "Billedet findes ikke");
    await tx.carImage.delete({ where: { id: imageId } });
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "carModel.image.delete",
      entityType: "CarModel",
      entityId: found.carModelId,
      diff: { imageId },
    });
    return found;
  });
  await storage().delete(image.storageKey);
  return { carModelId: image.carModelId };
}

/** Gør et billede til det første (forsidebilledet i kataloget). */
export async function makeModelImageFirst(ctx: PolicyContext, imageId: string) {
  assertCan(ctx, "catalog:write");
  if (!z.uuid().safeParse(imageId).success) throw new AppError("NOT_FOUND", "Billedet findes ikke");
  return db.$transaction(async (tx) => {
    const image = await tx.carImage.findUnique({ where: { id: imageId } });
    if (!image) throw new AppError("NOT_FOUND", "Billedet findes ikke");
    const others = await tx.carImage.findMany({
      where: { carModelId: image.carModelId, id: { not: imageId } },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    await tx.carImage.update({ where: { id: imageId }, data: { sortOrder: 0 } });
    for (const [index, other] of others.entries()) {
      await tx.carImage.update({ where: { id: other.id }, data: { sortOrder: index + 1 } });
    }
    return { carModelId: image.carModelId };
  });
}
