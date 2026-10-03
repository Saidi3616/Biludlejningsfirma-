import "server-only";
import { z } from "zod";
import type { BookingItemType, DepositStatus } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { netPaidMinor } from "@/lib/payments";
import { parseInput } from "@/lib/validation/parse";
import { settlementSchema } from "@/lib/validation/settlement";
import { assertCan, can, type PolicyContext } from "@/server/auth/policies";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { suggestFees } from "@/server/pricing/fees";
import { bookingRentalDays } from "./deposits";
import { paymentProvider } from "./provider";
import { refreshPaymentStatus } from "./refunds";

/**
 * Afregning efter aflevering (06-admin-flows.md F2): tillæg for ekstra km, brændstof, for sen
 * aflevering og skader lægges på bookingen; depositummet dækker tillæggene, og resten frigives
 * eller betales tilbage. Skadebeløb godkendes af en leder.
 */

/** Det, personalet ser på afregningssiden. */
export async function settlementContext(ctx: PolicyContext, bookingId: string) {
  assertCan(ctx, "booking:write");
  if (!z.uuid().safeParse(bookingId).success) {
    throw new AppError("NOT_FOUND", "Bookingen findes ikke");
  }
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      reference: true,
      status: true,
      settledAt: true,
      pickupAt: true,
      returnAt: true,
      totalMinor: true,
      depositStatus: true,
      depositMinor: true,
      currency: true,
      pickupLocation: { select: { timezone: true } },
      returnLocation: { select: { timezone: true } },
      customer: { select: { firstName: true, lastName: true } },
      carModel: {
        select: { brand: true, model: true, includedKmPerDay: true, extraKmFeeMinor: true },
      },
      car: { select: { registrationNumber: true } },
      items: { select: { type: true, quantity: true } },
      inspections: {
        orderBy: [{ performedAt: "asc" }, { type: "asc" }],
        select: { id: true, type: true, odometerKm: true, fuelLevel: true, performedAt: true },
      },
      damages: {
        where: { origin: "NEW" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          area: true,
          severity: true,
          liability: true,
          description: true,
          estimatedCostMinor: true,
        },
      },
      payments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          kind: true,
          status: true,
          method: true,
          amountMinor: true,
          provider: true,
          providerRef: true,
          isAuthorization: true,
        },
      },
    },
  });
  if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");

  const pickup = booking.inspections.find((inspection) => inspection.type === "PICKUP");
  const returned = booking.inspections.find((inspection) => inspection.type === "RETURN");
  const fees =
    pickup && returned
      ? suggestFees({
          pickupKm: pickup.odometerKm,
          returnKm: returned.odometerKm,
          rentalDays: bookingRentalDays(booking),
          includedKmPerDay: booking.carModel.includedKmPerDay,
          extraKmFeeMinor: booking.carModel.extraKmFeeMinor,
          pickupFuel: pickup.fuelLevel,
          returnFuel: returned.fuelLevel,
          returnAt: booking.returnAt,
          returnedAt: returned.performedAt,
        })
      : null;
  const holds = booking.payments.filter(
    (payment) => payment.kind === "DEPOSIT_HOLD" && payment.status === "SUCCEEDED",
  );
  return {
    ...booking,
    pickup: pickup ?? null,
    returned: returned ?? null,
    fees,
    holds,
    heldMinor: holds.reduce((sum, hold) => sum + hold.amountMinor, 0),
    balanceMinor: booking.totalMinor - netPaidMinor(booking.payments),
    canSettle: booking.status === "COMPLETED" && booking.settledAt === null && fees !== null,
    /** Nye skader kræver en leder (ansvar og beløb). */
    needsManager: booking.damages.length > 0 && !can(ctx, "damage:approveCost"),
  };
}

export type SettlementContext = Awaited<ReturnType<typeof settlementContext>>;

type Hold = SettlementContext["holds"][number];

/** Hvor meget der trækkes på hvert depositum; resten frigives eller betales tilbage. */
function allocate(holds: Hold[], captureMinor: number) {
  let remaining = captureMinor;
  return holds.map((hold) => {
    const capture = Math.min(remaining, hold.amountMinor);
    remaining -= capture;
    return { hold, capture, release: hold.amountMinor - capture };
  });
}

/**
 * Gennemfører afregningen. Udbyderen kaldes først (capture, frigivelse eller refusion af et
 * trukket depositum) med faste idempotency-nøgler, så et nyt forsøg efter en fejl aldrig
 * trækker to gange. Derefter registreres alt i én transaktion.
 */
export async function settleBooking(
  ctx: PolicyContext,
  bookingId: string,
  input: Record<string, unknown>,
  now = new Date(),
) {
  const values = parseInput(settlementSchema, input);
  const booking = await settlementContext(ctx, bookingId);
  if (!booking.canSettle) {
    throw new AppError("CONFLICT", "Bookingen kan ikke afregnes", {
      status: booking.status,
      settled: booking.settledAt !== null,
    });
  }

  // Alle nye skader fra lejen skal afklares, og det kræver en leder.
  const decided = new Map(values.damages.map((damage) => [damage.id, damage]));
  if (booking.damages.length > 0) assertCan(ctx, "damage:approveCost");
  const missing = booking.damages.filter((damage) => !decided.has(damage.id));
  if (missing.length > 0 || decided.size !== values.damages.length) {
    throw new AppError("VALIDATION_FAILED", "Alle skader skal afklares", {
      fields: missing.map((damage) => `damages.${damage.id}`),
    });
  }
  for (const id of decided.keys()) {
    if (!booking.damages.some((damage) => damage.id === id)) {
      throw new AppError("VALIDATION_FAILED", "Skaden hører ikke til bookingen", {
        fields: [`damages.${id}`],
      });
    }
  }
  const damageLines = booking.damages.map((damage) => {
    const decision = decided.get(damage.id)!;
    return {
      ...damage,
      liability: decision.liability,
      amountMinor: decision.liability === "CUSTOMER" ? decision.amount : 0,
    };
  });

  const fees = booking.fees!;
  const lines: { type: BookingItemType; label: string; quantity: number; unit: number }[] = [];
  const addFee = (
    type: BookingItemType,
    label: string,
    amountMinor: number,
    suggested: { quantity: number; unitPriceMinor: number; totalMinor: number },
  ) => {
    if (amountMinor <= 0) return;
    // Uændret forslag gemmes som antal × sats; et rettet beløb som én linje.
    if (amountMinor === suggested.totalMinor && suggested.quantity > 0) {
      lines.push({ type, label, quantity: suggested.quantity, unit: suggested.unitPriceMinor });
    } else {
      lines.push({ type, label, quantity: 1, unit: amountMinor });
    }
  };
  addFee("EXTRA_KM", "Ekstra km", values.extraKm, fees.extraKm);
  addFee("FUEL", "Brændstof", values.fuel, fees.fuel);
  addFee("LATE_FEE", "For sen aflevering", values.late, fees.late);
  for (const damage of damageLines) {
    if (damage.amountMinor > 0) {
      lines.push({ type: "DAMAGE", label: "Skade", quantity: 1, unit: damage.amountMinor });
    }
  }
  const feesMinor = lines.reduce((sum, line) => sum + line.quantity * line.unit, 0);

  // Depositummet dækker tillæg og evt. manglende betaling; et overskud fra lejen modregnes.
  const captureMinor = Math.min(Math.max(0, booking.balanceMinor + feesMinor), booking.heldMinor);
  const plan = allocate(booking.holds, captureMinor);

  const provider = booking.holds.some((hold) => hold.provider !== "manual")
    ? paymentProvider()
    : null;
  const returnRefs = new Map<string, string>();
  for (const { hold, capture, release } of plan) {
    if (hold.provider === "manual" || !hold.providerRef) continue;
    try {
      if (hold.isAuthorization) {
        if (capture > 0) {
          await provider!.captureDeposit(hold.providerRef, capture, `deposit:${hold.id}:capture`);
        } else {
          await provider!.releaseDeposit(hold.providerRef, `deposit:${hold.id}:release`);
        }
      } else if (release > 0) {
        const refund = await provider!.refund(
          hold.providerRef,
          release,
          `deposit:${hold.id}:return`,
        );
        returnRefs.set(hold.id, refund.providerRef);
      }
    } catch (error) {
      logger.error({ bookingId, paymentId: hold.id, err: error }, "deposit settlement failed");
      throw new AppError("SERVICE_UNAVAILABLE", "Betalingsudbyderen afviste depositummet");
    }
  }

  const actorUserId = ctx.actor!.userId;
  const depositStatus: DepositStatus =
    booking.heldMinor === 0 ? booking.depositStatus : captureMinor > 0 ? "CAPTURED" : "RELEASED";
  const result = await db.$transaction(async (tx) => {
    const updated = await tx.booking.updateMany({
      where: { id: bookingId, status: "COMPLETED", settledAt: null },
      data: {
        settledAt: now,
        subtotalMinor: { increment: feesMinor },
        totalMinor: { increment: feesMinor },
        depositStatus,
      },
    });
    if (updated.count === 0) throw new AppError("CONFLICT", "Bookingen er allerede afregnet");

    if (lines.length > 0) {
      await tx.bookingItem.createMany({
        data: lines.map((line) => ({
          bookingId,
          type: line.type,
          labelSnapshot: line.label,
          quantity: line.quantity,
          unitPriceMinor: line.unit,
          totalMinor: line.quantity * line.unit,
          currency: booking.currency,
        })),
      });
    }
    for (const damage of damageLines) {
      await tx.damage.update({
        where: { id: damage.id },
        data: {
          liability: damage.liability,
          ...(damage.liability === "CUSTOMER" ? { estimatedCostMinor: damage.amountMinor } : {}),
        },
      });
    }
    for (const { hold, capture, release } of plan) {
      const common = {
        bookingId,
        parentPaymentId: hold.id,
        status: "SUCCEEDED" as const,
        method: hold.method,
        currency: booking.currency,
        provider: hold.provider,
        recordedByUserId: actorUserId,
      };
      if (capture > 0) {
        await tx.payment.create({
          data: { ...common, kind: "DEPOSIT_CAPTURE", amountMinor: capture },
        });
      }
      if (release > 0) {
        await tx.payment.create({
          data: {
            ...common,
            kind: "DEPOSIT_RETURN",
            amountMinor: release,
            providerRef: returnRefs.get(hold.id) ?? null,
          },
        });
      }
    }
    await refreshPaymentStatus(tx, bookingId);
    const after = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: {
        totalMinor: true,
        payments: { select: { kind: true, status: true, amountMinor: true } },
      },
    });
    await audit(tx, {
      actorUserId,
      action: "booking.settle",
      entityType: "Booking",
      entityId: bookingId,
      diff: {
        extraKmMinor: values.extraKm,
        fuelMinor: values.fuel,
        lateMinor: values.late,
        damages: damageLines.map((damage) => ({
          id: damage.id,
          liability: damage.liability,
          amountMinor: damage.amountMinor,
        })),
        capturedMinor: captureMinor,
        returnedMinor: booking.heldMinor - captureMinor,
      },
    });
    return {
      feesMinor,
      capturedMinor: captureMinor,
      returnedMinor: booking.heldMinor - captureMinor,
      /** Kontant depositum, der skal betales tilbage ved skranken nu. */
      cashBackMinor: plan
        .filter(({ hold }) => hold.provider === "manual")
        .reduce((sum, { release }) => sum + release, 0),
      balanceMinor: after.totalMinor - netPaidMinor(after.payments),
    };
  });
  logger.info({ bookingId, feesMinor, capturedMinor: captureMinor }, "booking settled");
  return result;
}
