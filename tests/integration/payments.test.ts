import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import type { CreateBookingRequest } from "@/lib/validation/booking";
import { parseCheckoutQuery } from "@/lib/validation/checkout";
import { parseCarSearch } from "@/lib/validation/search";
import { createCheckoutBooking, loadCheckout } from "@/server/booking/checkout";
import { createBooking } from "@/server/booking/create";
import { expireReservations } from "@/server/booking/expire";
import { db } from "@/server/db";
import { fakeProvider } from "@/server/payments/providers/fake";
import { handlePaymentWebhook, startPayment } from "@/server/payments/service";
import { addPrices, bookingData, createFleet, resetDb } from "./helpers";

type Fleet = Awaited<ReturnType<typeof createFleet>>;
let fleet: Fleet;

const now = new Date("2026-05-01T08:00:00Z");
const MINUTE = 60_000;

function request(overrides: Partial<CreateBookingRequest> = {}): CreateBookingRequest {
  return {
    carModelId: fleet.carModel.id,
    pickupLocationId: fleet.location.id,
    returnLocationId: fleet.location.id,
    pickupAt: "2026-06-01T10:00:00+02:00",
    returnAt: "2026-06-04T10:00:00+02:00",
    customer: { firstName: "Mette", lastName: "Hansen", email: "mette@example.com" },
    ...overrides,
  };
}

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  return null;
}

/** Reservation + startet betaling; returnerer bookingen og betalingens reference hos udbyderen. */
async function reserveAndStart(overrides: Partial<CreateBookingRequest> = {}) {
  const { booking } = await createBooking(request(overrides), { now });
  await startPayment(booking.id, now);
  const payment = await db.payment.findFirstOrThrow({ where: { bookingId: booking.id } });
  return { booking, providerRef: payment.providerRef! };
}

function event(providerRef: string, outcome: "succeeded" | "failed", amountMinor = 99900) {
  return fakeProvider.signedEvent(providerRef, outcome, amountMinor, "DKK");
}

beforeEach(async () => {
  await resetDb();
  fleet = await createFleet();
  await addPrices(fleet);
});

describe("start betaling", () => {
  it("opretter én betaling med bookingens beløb og genbruger den ved genindlæsning", async () => {
    const { booking } = await createBooking(request(), { now });
    const first = await startPayment(booking.id, now);
    const again = await startPayment(booking.id, now);
    expect(first).toMatchObject({ provider: "fake", amountMinor: 99900, currency: "DKK" });
    expect(again.clientSecret).toBe(first.clientSecret);
    expect(await db.payment.findMany({ where: { bookingId: booking.id } })).toMatchObject([
      { kind: "CHARGE", status: "PENDING", amountMinor: 99900, provider: "fake" },
    ]);
  });

  it("en udløbet reservation kan ikke betales", async () => {
    const { booking } = await createBooking(request(), { now });
    const later = new Date(now.getTime() + 16 * MINUTE);
    expect(await errorOf(startPayment(booking.id, later))).toBe("RESERVATION_EXPIRED");
  });
});

describe("webhook", () => {
  it("gennemført betaling bekræfter bookingen; samme event igen giver ingen dubletter", async () => {
    const { booking, providerRef } = await reserveAndStart();
    const { body, signature } = event(providerRef, "succeeded");

    expect(await handlePaymentWebhook(body, signature)).toBe("processed");
    expect(await handlePaymentWebhook(body, signature)).toBe("duplicate");

    const saved = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { payments: true, statusEvents: true },
    });
    expect(saved).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID", expiresAt: null });
    expect(saved.payments).toMatchObject([
      { status: "SUCCEEDED", method: "CARD", cardBrand: "visa", cardLast4: "4242" },
    ]);
    expect(saved.statusEvents.map((e) => e.toStatus).sort()).toEqual([
      "CONFIRMED",
      "PENDING_PAYMENT",
    ]);
    expect(await db.processedWebhook.count()).toBe(1);
  });

  it("samtidige leveringer af samme event behandles kun én gang", async () => {
    const { providerRef } = await reserveAndStart();
    const { body, signature } = event(providerRef, "succeeded");
    const results = await Promise.all([
      handlePaymentWebhook(body, signature),
      handlePaymentWebhook(body, signature),
    ]);
    expect(results.sort()).toEqual(["duplicate", "processed"]);
    expect(await db.bookingStatusEvent.count({ where: { toStatus: "CONFIRMED" } })).toBe(1);
  });

  it("forkert signatur afvises, og intet ændres", async () => {
    const { booking, providerRef } = await reserveAndStart();
    const { body } = event(providerRef, "succeeded");
    expect(await errorOf(handlePaymentWebhook(body, "forfalsket"))).toBe("WEBHOOK_INVALID");
    expect(await errorOf(handlePaymentWebhook(body, null))).toBe("WEBHOOK_INVALID");
    const saved = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(saved.status).toBe("PENDING_PAYMENT");
  });

  it("afvist kort: reservationen holdes, og kunden kan prøve igen", async () => {
    const { booking, providerRef } = await reserveAndStart();
    const failed = event(providerRef, "failed");
    expect(await handlePaymentWebhook(failed.body, failed.signature)).toBe("processed");
    let saved = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { payments: true },
    });
    expect(saved).toMatchObject({ status: "PENDING_PAYMENT", paymentStatus: "FAILED" });
    expect(saved.payments[0]).toMatchObject({ status: "FAILED", failureCode: "card_declined" });

    // Samme betaling genbruges ved næste forsøg.
    await startPayment(booking.id, now);
    expect(await db.payment.count()).toBe(1);
    const ok = event(providerRef, "succeeded");
    await handlePaymentWebhook(ok.body, ok.signature);
    saved = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { payments: true },
    });
    expect(saved).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID" });
  });

  it("rabatkoden registreres først, når betalingen er gennemført", async () => {
    await db.discount.create({ data: { code: "TI", type: "PERCENT", value: 10 } });
    const { booking, providerRef } = await reserveAndStart({ discountCode: "ti" });
    expect(await db.discountRedemption.count()).toBe(0);
    const { body, signature } = event(providerRef, "succeeded", booking.totalMinor);
    await handlePaymentWebhook(body, signature);
    expect(await db.discountRedemption.findMany()).toMatchObject([
      { bookingId: booking.id, amountMinor: 9990 },
    ]);
  });

  it("betaling efter udløb: bekræftes, hvis bilen stadig er ledig", async () => {
    const { booking, providerRef } = await reserveAndStart();
    await expireReservations(new Date(now.getTime() + 16 * MINUTE));
    const { body, signature } = event(providerRef, "succeeded");
    expect(await handlePaymentWebhook(body, signature)).toBe("processed");
    const saved = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(saved).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID" });
  });

  it("betaling efter udløb, når bilen er taget: refunderes fuldt", async () => {
    await db.car.update({ where: { id: fleet.carB.id }, data: { opStatus: "RETIRED" } });
    const { booking, providerRef } = await reserveAndStart();
    await expireReservations(new Date(now.getTime() + 16 * MINUTE));
    await db.booking.create({
      data: bookingData(fleet, fleet.carA.id, "2026-06-01T08:00:00Z", "2026-06-04T08:00:00Z"),
    });

    const { body, signature } = event(providerRef, "succeeded");
    expect(await handlePaymentWebhook(body, signature)).toBe("refunded");
    expect(await handlePaymentWebhook(body, signature)).toBe("duplicate");

    const saved = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { payments: { orderBy: { createdAt: "asc" } } },
    });
    expect(saved).toMatchObject({ status: "EXPIRED", paymentStatus: "REFUNDED" });
    expect(saved.payments).toMatchObject([
      { kind: "CHARGE", status: "SUCCEEDED" },
      { kind: "REFUND", status: "SUCCEEDED", amountMinor: 99900 },
    ]);
  });

  it("events for ukendte betalinger eller andre typer ignoreres", async () => {
    const { body, signature } = event("fake_pi_findes_ikke", "succeeded");
    expect(await handlePaymentWebhook(body, signature)).toBe("ignored");
  });
});

describe("bookingflowet", () => {
  const params = {
    car: "test-model",
    location: "test",
    pickupDate: "2026-06-01",
    pickupTime: "10:00",
    returnDate: "2026-06-04",
    returnTime: "10:00",
  };
  const details = {
    firstName: "Mette",
    lastName: "Hansen",
    email: "mette@example.com",
    phone: "+4512345678",
    deliveryAddress: null,
    acceptTerms: "on" as const,
    idempotencyKey: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
  };

  it("viser prisen med kundens valg; en ugyldig rabatkode giver pris uden rabat", async () => {
    const checkout = await loadCheckout(
      parseCarSearch(params),
      parseCheckoutQuery({ ...params, discount: "FINDESIKKE" }),
      { locale: "da", now },
    );
    expect(checkout.status).toBe("ready");
    if (checkout.status !== "ready") return;
    expect(checkout.quote.totalMinor).toBe(99900);
    expect(checkout.discountError).toBe("NOT_FOUND");
  });

  it("opretter reservationen med vilkårsversion; prisen beregnes på serveren", async () => {
    const { booking } = await createCheckoutBooking(
      parseCarSearch(params),
      parseCheckoutQuery(params),
      details,
      { locale: "da", userId: null, ip: "198.51.100.10", now },
    );
    expect(booking).toMatchObject({
      status: "PENDING_PAYMENT",
      totalMinor: 99900,
      termsVersion: "2026-10-udkast",
      idempotencyKey: details.idempotencyKey,
    });
  });

  it("højst 10 bookingforsøg pr. IP i timen", async () => {
    const context = { locale: "da" as const, userId: null, ip: "198.51.100.11", now };
    for (let i = 0; i < 10; i++) {
      await errorOf(
        createCheckoutBooking(parseCarSearch({}), parseCheckoutQuery({}), details, context),
      );
    }
    expect(
      await errorOf(
        createCheckoutBooking(parseCarSearch(params), parseCheckoutQuery(params), details, context),
      ),
    ).toBe("RATE_LIMITED");
  });
});
