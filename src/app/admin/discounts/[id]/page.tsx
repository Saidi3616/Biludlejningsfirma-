import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Price } from "@/components/ui/price";
import { DiscountForm } from "@/components/features/admin/discount-form";
import { AppError } from "@/lib/errors";
import { minorToInput } from "@/lib/format";
import { adminDiscount, discountOptions } from "@/server/admin/discounts";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import { deleteDiscountAction, updateDiscountAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.discounts" });
  return { title: t("editTitle") };
}

const optional = (value: number | null) => (value === null ? "" : String(value));

/** Ret en rabatkode. En brugt kode kan kun stoppes, ikke slettes eller omdøbes. */
export default async function DiscountPage({ params }: PageProps<"/admin/discounts/[id]">) {
  setRequestLocale("da");
  await requirePermission("catalog:write");
  const { id } = await params;
  const ctx = await getPolicyContext();
  const [discount, options] = await Promise.all([
    adminDiscount(ctx, id).catch((error) => {
      if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
      throw error;
    }),
    discountOptions(ctx),
  ]);
  const t = await getTranslations("admin.discounts");
  const used = Math.max(discount.used, discount.bookings);

  return (
    <>
      <Link
        href="/admin/discounts"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <h1 className="font-mono text-2xl font-semibold tracking-tight text-ink-900">
        {discount.code}
      </h1>
      {discount.givenMinor > 0 ? (
        <p className="text-muted">
          {t("given")}
          <Price amountMinor={discount.givenMinor} currency={discount.currency ?? "DKK"} />
        </p>
      ) : null}
      <Card>
        <CardBody>
          <DiscountForm
            action={updateDiscountAction}
            discountId={discount.id}
            options={options}
            codeLocked={discount.bookings > 0}
            defaults={{
              code: discount.code,
              type: discount.type,
              value:
                discount.type === "PERCENT" ? String(discount.value) : minorToInput(discount.value),
              validFrom: discount.validFrom ?? "",
              validTo: discount.validTo ?? "",
              minBooking:
                discount.minBookingMinor === null ? "" : minorToInput(discount.minBookingMinor),
              minDays: optional(discount.minDays),
              maxUses: optional(discount.maxUses),
              maxUsesPerCustomer: optional(discount.maxUsesPerCustomer),
              categoryIds: discount.categoryIds,
              carModelIds: discount.carModelIds,
              isActive: discount.isActive ? "on" : "",
            }}
          />
        </CardBody>
      </Card>
      {used === 0 ? (
        <form action={deleteDiscountAction}>
          <input type="hidden" name="discountId" value={discount.id} />
          <Button type="submit" variant="danger">
            <Trash2 aria-hidden />
            {t("delete")}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted">{t("usedNote", { count: used })}</p>
      )}
    </>
  );
}
