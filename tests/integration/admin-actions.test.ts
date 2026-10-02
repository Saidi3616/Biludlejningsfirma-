import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { addDaysToKey, fromLocal, localDateKey } from "@/lib/dates";
import {
  reassignCar,
  reassignOptions,
  rescheduleBooking,
  reschedulePreview,
} from "@/server/admin/changes";
import {
  adminCancelBooking,
  adminCancellationPreview,
  adminRefund,
  recordManualPayment,
  retryRefund,
} from "@/server/admin/payments";
import { createPhoneBooking, PAYMENT_LINK_MINUTES } from "@/server/admin/phone-booking";
import type { PolicyContext } from "@/server/auth/policies";
import { cancelBooking } from "@/server/booking/cancel";
import { createBooking } from "@/server/booking/create";
import { db } from "@/server/db";
import { captureEmails, useEmailTransportForTests, type Email } from "@/server/email/send";
import { sendDueNotifications } from "@/server/notifications/dispatch";
import { fakeProvider } from "@/server/payments/providers/fake";
import { handlePaymentWebhook, startPayment } from "@/server/payments/service";
import { addPrices, bookingData, createFleet, resetDb } from "./helpers";

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    serverEnv: () => ({ ...actual.serverEnv(), AUTH_URL: "https://www.example.dk" }),
  };
});

type Fleet = Awaited<ReturnType<typeof createFleet>>;
let fleet: Fleet;
let outbox: Email[];

const TZ = "Europe/Copenhagen";
const now = new Date();
const day = (offset: number) => addDaysToKey(localDateKey(now, TZ), offset);
// Afhentning om 10 dage kl. 10, aflevering 3 dage senere: 999 kr. (helpers.addPrices).
const pickupAt = fromLocal(day(10), "10:00", TZ);
const returnAt = fromLocal(day(13), "10:00", TZ);

async function actor(role: Role): Promise<PolicyContext> {
  const user = await db.user.create({
    data: {
      email: `${role.toLowerCase()}@example.com`,
      name: `${role} Test`,
      role,
      emailVerified: true,
    },
  });
  return { actor: { userId: user.id, role, twoFactorEnabled: true } };
}

let staff: PolicyContext;
let manager: PolicyContext;

async function paidBooking() {
  const { booking } = await createBooking(
    {
      carModelId: fleet.carModel.id,
      pickupLocationId: fleet.location.id,
      returnLocationId: fleet.location.id,
      pickupAt,
      returnAt,
      customer: { firstName: "Mette", lastName: "Hansen", email: "mette@example.com" },
    },
    { now },
  );
  await startPayment(booking.id, now);
  const payment = await db.payment.findFirstOrThrow({ where: { bookingId: booking.id } });
  const { body, signature } = fakeProvider.signedEvent(
    payment.providerRef!,
    "succeeded",
    payment.amountMinor,
    "DKK",
  );
  await handlePaymentWebhook(body, signature);
  return db.booking.findUniqueOrThrow({ where: { id: booking.id } });
}

function phoneInput(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Ole",
    lastName: "Telefon",
    email: "OLE@example.com",
    phone: "12 34 56 78",
    locale: "da",
    carModelId: fleet.carModel.id,
    pickupLocationId: fleet.location.id,
    returnLocationId: fleet.location.id,
    pickupDate: day(10),
    pickupTime: "10:00",
    returnDate: day(13),
    returnTime: "10:00",
    extras: [],
    discountCode: "",
    payment: "link",
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDb();
  fleet = await createFleet();
  await addPrices(fleet);
  await db.openingHours.deleteMany({ where: { locationId: fleet.location.id } });
  await db.openingHours.createMany({
    data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      locationId: fleet.location.id,
      weekday,
      opensAt: "00:00",
      closesAt: "23:59",
    })),
  });
  staff = await actor("STAFF");
  manager = await actor("MANAGER");
  outbox = captureEmails();
});

afterEach(() => {
  useEmailTransportForTests(undefined);
  vi.restoreAllMocks();
});

describe("annullering fra admin (F6)", () => {
  it("lederen kan overstyre refusionen; årsagen står i historikken", async () => {
    const booking = await paidBooking();
    const preview = await adminCancellationPreview(manager, booking.id, now);
    expect(preview).toMatchObject({ allowed: true, paidMinor: 99900, suggestedRefundMinor: 99900 });

    const result = await adminCancelBooking(manager, booking.id, {
      refund: "300,00",
      reason: "Kunden er syg, aftalt i telefonen",
      confirm: "on",
    });
    expect(result).toMatchObject({ refundMinor: 30000, refundsFailed: 0 });

    const after = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { payments: { where: { kind: "REFUND" } }, statusEvents: true },
    });
    expect(after.status).toBe("CANCELLED");
    expect(after.paymentStatus).toBe("PARTIALLY_REFUNDED");
    expect(after.payments).toMatchObject([{ status: "SUCCEEDED", amountMinor: 30000 }]);
    expect(after.statusEvents.at(-1)).toMatchObject({
      toStatus: "CANCELLED",
      reason: "Kunden er syg, aftalt i telefonen",
      actorUserId: manager.actor!.userId,
    });
    expect(await db.auditLog.count({ where: { action: "booking.cancel" } })).toBe(1);

    await sendDueNotifications({ now: new Date() });
    expect(outbox.find((email) => email.subject.includes("annulleret"))?.text).toMatch(
      /Vi refunderer 300\skr\./,
    );
  });

  it("afviser medarbejdere, for stor refusion og manglende årsag", async () => {
    const booking = await paidBooking();
    const input = { refund: "0", reason: "Dobbeltbooking", confirm: "on" };
    await expect(adminCancelBooking(staff, booking.id, input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      adminCancelBooking(manager, booking.id, { ...input, refund: "1000" }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", details: { fields: ["refund"] } });
    await expect(
      adminCancelBooking(manager, booking.id, { ...input, reason: "", confirm: "" }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
      "CONFIRMED",
    );
  });

  it("en refusion, der fejler hos udbyderen, kan prøves igen", async () => {
    const booking = await paidBooking();
    vi.spyOn(fakeProvider, "refund").mockRejectedValueOnce(new Error("Stripe nede"));
    const result = await adminCancelBooking(manager, booking.id, {
      refund: "999",
      reason: "Bilen er skadet",
      confirm: "on",
    });
    expect(result.refundsFailed).toBe(1);
    const pending = await db.payment.findFirstOrThrow({ where: { kind: "REFUND" } });
    expect(pending.status).toBe("PENDING");

    await expect(retryRefund(staff, pending.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await retryRefund(manager, pending.id);
    const after = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { payments: { where: { kind: "REFUND" } } },
    });
    expect(after.payments.map((payment) => payment.status)).toEqual(["SUCCEEDED"]);
    expect(after.paymentStatus).toBe("REFUNDED");
    await expect(retryRefund(manager, pending.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("betaling ved skranken og refusion", () => {
  it("en kontant betaling bekræfter en reservation; en ekstra betaling giver en kvittering", async () => {
    const { reference } = await createPhoneBooking(staff, phoneInput(), now);
    const booking = await db.booking.findUniqueOrThrow({ where: { reference } });
    await recordManualPayment(staff, booking.id, { amount: "999", method: "CASH" }, now);

    const after = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { payments: true },
    });
    expect(after).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID", expiresAt: null });
    expect(after.payments).toMatchObject([
      {
        kind: "MANUAL",
        status: "SUCCEEDED",
        method: "CASH",
        amountMinor: 99900,
        recordedByUserId: staff.actor!.userId,
      },
    ]);

    await recordManualPayment(staff, booking.id, { amount: "50", method: "MOBILEPAY" }, now);
    await recordManualPayment(staff, booking.id, { amount: "25", method: "CASH" }, now);
    const receipts = await db.notification.count({
      where: { bookingId: booking.id, template: "PAYMENT_RECEIVED" },
    });
    expect(receipts).toBe(2);
    await expect(
      recordManualPayment(staff, booking.id, { amount: "-5", method: "CASH" }, now),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("refusion fordeles: kortbetalingen først, resten betales tilbage kontant", async () => {
    const booking = await paidBooking();
    await recordManualPayment(staff, booking.id, { amount: "100", method: "CASH" }, now);
    await adminRefund(manager, booking.id, { amount: "1.049,00", reason: "Kortere leje" });

    const refunds = await db.payment.findMany({
      where: { bookingId: booking.id, kind: "REFUND" },
      orderBy: { amountMinor: "desc" },
    });
    expect(refunds).toMatchObject([
      { amountMinor: 99900, status: "SUCCEEDED", provider: "fake" },
      { amountMinor: 5000, status: "SUCCEEDED", provider: "manual", method: "CASH" },
    ]);
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).paymentStatus).toBe(
      "PARTIALLY_REFUNDED",
    );
    await expect(
      adminRefund(manager, booking.id, { amount: "51", reason: "For meget" }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      adminRefund(staff, booking.id, { amount: "1", reason: "Ingen adgang" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("kontant refusion ved kundens egen annullering", () => {
  it("venter, til personalet har betalt pengene tilbage", async () => {
    const { reference } = await createPhoneBooking(staff, phoneInput({ payment: "counter" }), now);
    const booking = await db.booking.findUniqueOrThrow({ where: { reference } });
    await recordManualPayment(staff, booking.id, { amount: "999", method: "CASH" }, now);
    await cancelBooking(booking.id, { now });

    const refund = await db.payment.findFirstOrThrow({ where: { kind: "REFUND" } });
    expect(refund).toMatchObject({ status: "PENDING", provider: "manual", amountMinor: 99900 });
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).paymentStatus).toBe(
      "PAID",
    );

    await retryRefund(manager, refund.id);
    expect(await db.payment.findUniqueOrThrow({ where: { id: refund.id } })).toMatchObject({
      status: "SUCCEEDED",
      recordedByUserId: manager.actor!.userId,
    });
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).paymentStatus).toBe(
      "REFUNDED",
    );
  });
});

describe("telefonbooking (F3)", () => {
  it("betalingslink: reservationen holdes et døgn, og kunden får et link", async () => {
    const created = await createPhoneBooking(staff, phoneInput(), now);
    expect(created.payment).toBe("link");
    const booking = await db.booking.findUniqueOrThrow({
      where: { reference: created.reference },
      include: { customer: true, statusEvents: true },
    });
    expect(booking.status).toBe("PENDING_PAYMENT");
    expect(booking.expiresAt?.getTime()).toBe(now.getTime() + PAYMENT_LINK_MINUTES * 60_000);
    expect(booking.customer).toMatchObject({
      email: "ole@example.com",
      phoneE164: "+4512345678",
      userId: null,
    });
    expect(booking.manageTokenHash).not.toBeNull();
    expect(booking.statusEvents[0]?.actorUserId).toBe(staff.actor!.userId);

    await sendDueNotifications({ now: new Date() });
    const email = outbox.find((sent) => sent.subject.includes("Betal din booking"));
    expect(email?.text).toContain("https://www.example.dk/booking/manage/");
    expect(email?.text).toMatch(/Betal 999\skr\./);
  });

  it("ved skranken: bekræftet med det samme og ubetalt", async () => {
    const created = await createPhoneBooking(staff, phoneInput({ payment: "counter" }), now);
    const booking = await db.booking.findUniqueOrThrow({ where: { reference: created.reference } });
    expect(booking).toMatchObject({
      status: "CONFIRMED",
      paymentStatus: "UNPAID",
      expiresAt: null,
    });
    const templates = await db.notification.findMany({
      where: { bookingId: booking.id },
      select: { template: true },
    });
    expect(templates.map((row) => row.template)).toContain("BOOKING_CONFIRMED");
  });

  it("samme regler som online: ugyldige felter og en optaget model afvises", async () => {
    await expect(
      createPhoneBooking(staff, phoneInput({ phone: "12", email: "x" }), now),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", details: { fields: ["email", "phone"] } });
    await createPhoneBooking(staff, phoneInput(), now);
    await createPhoneBooking(staff, phoneInput(), now);
    await expect(createPhoneBooking(staff, phoneInput(), now)).rejects.toMatchObject({
      code: "CAR_NO_LONGER_AVAILABLE",
    });
    await expect(createPhoneBooking({ actor: null }, phoneInput(), now)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});

describe("ny periode og anden bil (F4, F5)", () => {
  it("flytter bookingen på samme bil, flytter påmindelser og giver kunden besked", async () => {
    const booking = await paidBooking();
    const input = {
      pickupDate: day(20),
      pickupTime: "12:00",
      returnDate: day(27),
      returnTime: "12:00",
      price: "keep",
    };
    const preview = await reschedulePreview(staff, booking.id, input, now);
    expect(preview).toMatchObject({
      sameCar: true,
      currentTotalMinor: 99900,
      newTotalMinor: 199900,
    });

    const result = await rescheduleBooking(staff, booking.id, input, now);
    expect(result).toEqual({ carChanged: false, totalMinor: 99900, balanceMinor: 0 });
    const after = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.pickupAt).toEqual(fromLocal(day(20), "12:00", TZ));
    expect(after.carId).toBe(booking.carId);

    const reminder = await db.notification.findFirstOrThrow({
      where: { bookingId: booking.id, template: "PICKUP_REMINDER", channel: "EMAIL" },
    });
    expect(reminder.scheduledAt).toEqual(new Date(after.pickupAt.getTime() - 24 * 3_600_000));
    expect(
      await db.notification.count({
        where: { bookingId: booking.id, template: "BOOKING_CHANGED" },
      }),
    ).toBeGreaterThan(0);
    expect(await db.auditLog.count({ where: { action: "booking.reschedule" } })).toBe(1);
  });

  it("ny pris og en anden bil, når den nuværende er optaget", async () => {
    const booking = await paidBooking();
    const otherCar = booking.carId === fleet.carA.id ? fleet.carB : fleet.carA;
    // Den nuværende bil er optaget i den nye periode.
    await db.booking.create({
      data: bookingData(
        fleet,
        booking.carId,
        fromLocal(day(30), "08:00", TZ).toISOString(),
        fromLocal(day(31), "18:00", TZ).toISOString(),
      ),
    });
    const input = {
      pickupDate: day(30),
      pickupTime: "10:00",
      returnDate: day(31),
      returnTime: "10:00",
      price: "new",
    };
    const result = await rescheduleBooking(staff, booking.id, input, now);
    expect(result).toEqual({ carChanged: true, totalMinor: 39900, balanceMinor: -60000 });
    const after = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { items: true },
    });
    expect(after.carId).toBe(otherCar.id);
    expect(after.items.map((item) => [item.type, item.totalMinor])).toEqual([["RENTAL", 39900]]);

    // Begge biler optaget: ingen ændring.
    await db.booking.create({
      data: bookingData(
        fleet,
        otherCar.id,
        fromLocal(day(40), "08:00", TZ).toISOString(),
        fromLocal(day(41), "18:00", TZ).toISOString(),
      ),
    });
    await db.booking.create({
      data: bookingData(
        fleet,
        booking.carId,
        fromLocal(day(40), "08:00", TZ).toISOString(),
        fromLocal(day(41), "18:00", TZ).toISOString(),
      ),
    });
    await expect(
      rescheduleBooking(
        staff,
        booking.id,
        { ...input, pickupDate: day(40), returnDate: day(41) },
        now,
      ),
    ).rejects.toMatchObject({ code: "CAR_NO_LONGER_AVAILABLE" });
  });

  it("omplacerer til en ledig bil af samme model, men ikke til en optaget", async () => {
    const booking = await paidBooking();
    const otherCar = booking.carId === fleet.carA.id ? fleet.carB : fleet.carA;
    expect((await reassignOptions(staff, booking.id, now)).map((car) => car.id)).toEqual([
      otherCar.id,
    ]);
    await reassignCar(staff, booking.id, { carId: otherCar.id }, now);
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).carId).toBe(
      otherCar.id,
    );

    // Den første bil får en anden booking i samme periode; så kan vi ikke flytte tilbage.
    await db.booking.create({
      data: bookingData(fleet, booking.carId, pickupAt.toISOString(), returnAt.toISOString()),
    });
    await expect(
      reassignCar(staff, booking.id, { carId: booking.carId }, now),
    ).rejects.toMatchObject({ code: "CAR_NO_LONGER_AVAILABLE" });
  });

  it("en annulleret booking kan ikke ændres", async () => {
    const booking = await paidBooking();
    await adminCancelBooking(manager, booking.id, { refund: "0", reason: "Test", confirm: "on" });
    await expect(
      reassignCar(staff, booking.id, { carId: fleet.carB.id }, now),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
