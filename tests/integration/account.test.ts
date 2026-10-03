import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateBookingRequest } from "@/lib/validation/booking";
import {
  claimGuestBookings,
  customerBookings,
  customerPayments,
  updateProfile,
} from "@/server/account/service";
import { findBookingByManageToken } from "@/server/booking/access";
import { bookingCancellationTerms, cancelBooking } from "@/server/booking/cancel";
import { createBooking } from "@/server/booking/create";
import { manageTokenFor } from "@/server/booking/tokens";
import { db } from "@/server/db";
import { captureEmails, useEmailTransportForTests, type Email } from "@/server/email/send";
import { sendDueNotifications } from "@/server/notifications/dispatch";
import { fakeProvider } from "@/server/payments/providers/fake";
import { handlePaymentWebhook, startPayment } from "@/server/payments/service";
import { addPrices, createFleet, resetDb } from "./helpers";

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

const HOUR = 60 * 60_000;
// Afhentning om 5 dage: gratis annullering indtil 48 timer før.
const now = new Date();
const pickupAt = new Date(Math.ceil((now.getTime() + 5 * 24 * HOUR) / HOUR) * HOUR);
const returnAt = new Date(pickupAt.getTime() + 3 * 24 * HOUR);

function request(overrides: Partial<CreateBookingRequest> = {}): CreateBookingRequest {
  return {
    carModelId: fleet.carModel.id,
    pickupLocationId: fleet.location.id,
    returnLocationId: fleet.location.id,
    pickupAt,
    returnAt,
    customer: { firstName: "Mette", lastName: "Hansen", email: "mette@example.com" },
    ...overrides,
  };
}

async function paidBooking(context: { userId?: string } = {}) {
  const { booking } = await createBooking(request(), { now, ...context });
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

async function createUser(email = "mette@example.com") {
  return db.user.create({
    data: { email, name: "Mette Hansen", emailVerified: true },
  });
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
  outbox = captureEmails();
});

afterEach(() => {
  useEmailTransportForTests(undefined);
  vi.restoreAllMocks();
});

describe("annulleringspolitik", () => {
  it("fuld refusion indtil 48 timer før, derefter 50 %, og ingen annullering efter afhentning", async () => {
    const booking = await paidBooking();
    const free = await bookingCancellationTerms(booking.id, now);
    expect(free).toMatchObject({ allowed: true, free: true, refundMinor: booking.totalMinor });
    if (free.allowed) {
      expect(free.freeUntil).toEqual(new Date(pickupAt.getTime() - 48 * HOUR));
    }

    const late = await bookingCancellationTerms(booking.id, new Date(pickupAt.getTime() - HOUR));
    expect(late).toMatchObject({
      allowed: true,
      free: false,
      refundMinor: Math.floor(booking.totalMinor / 2),
    });
    expect(await bookingCancellationTerms(booking.id, pickupAt)).toEqual({ allowed: false });
  });

  it("en ubetalt reservation kan ikke annulleres online", async () => {
    const { booking } = await createBooking(request(), { now });
    expect(await bookingCancellationTerms(booking.id, now)).toEqual({ allowed: false });
    await expect(cancelBooking(booking.id, { now })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("kunden annullerer", () => {
  it("gratis: bilen frigives, alt refunderes, og kunden får en kvittering", async () => {
    const booking = await paidBooking();
    const result = await cancelBooking(booking.id, { now });
    expect(result.refundMinor).toBe(booking.totalMinor);

    const after = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { payments: { where: { kind: "REFUND" } } },
    });
    expect(after.status).toBe("CANCELLED");
    expect(after.paymentStatus).toBe("REFUNDED");
    expect(after.payments).toMatchObject([
      { status: "SUCCEEDED", amountMinor: booking.totalMinor, providerRef: expect.any(String) },
    ]);

    // Bekræftelsen er allerede sendt; påmindelserne springes over, og annulleringen sendes.
    await sendDueNotifications({ now: new Date() });
    const cancelled = outbox.find((email) => email.subject.includes("annulleret"));
    expect(cancelled?.text).toContain("Vi refunderer");
    const reminders = await db.notification.findMany({
      where: { template: { in: ["PICKUP_REMINDER", "RETURN_REMINDER"] } },
    });
    await sendDueNotifications({ now: new Date(returnAt.getTime() + HOUR) });
    expect(
      (await db.notification.findMany({ where: { id: { in: reminders.map((r) => r.id) } } })).map(
        (row) => row.status,
      ),
    ).toEqual(["SKIPPED", "SKIPPED"]);
  });

  it("sent: halvdelen refunderes", async () => {
    const booking = await paidBooking();
    const lateNow = new Date(pickupAt.getTime() - 24 * HOUR);
    const result = await cancelBooking(booking.id, { now: lateNow });
    expect(result.refundMinor).toBe(Math.floor(booking.totalMinor / 2));
    const after = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.paymentStatus).toBe("PARTIALLY_REFUNDED");
  });

  it("to annulleringer på samme tid: kun én lykkes og kun én refusion", async () => {
    const booking = await paidBooking();
    const results = await Promise.allSettled([
      cancelBooking(booking.id, { now }),
      cancelBooking(booking.id, { now }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.payment.count({ where: { kind: "REFUND" } })).toBe(1);
  });

  it("fejler refusionen hos udbyderen, står bookingen annulleret og refusionen venter", async () => {
    const booking = await paidBooking();
    vi.spyOn(fakeProvider, "refund").mockRejectedValueOnce(new Error("Stripe nede"));
    await cancelBooking(booking.id, { now });
    const after = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { payments: { where: { kind: "REFUND" } } },
    });
    expect(after.status).toBe("CANCELLED");
    expect(after.paymentStatus).toBe("PAID");
    expect(after.payments.map((payment) => payment.status)).toEqual(["PENDING"]);
  });
});

describe("administrér-link til gæster", () => {
  it("tokenet i e-mailen åbner bookingen; et forkert token gør ikke", async () => {
    const booking = await paidBooking();
    const { token } = manageTokenFor(booking.reference);
    expect(await findBookingByManageToken(token)).toBe(booking.reference);
    expect(await findBookingByManageToken(manageTokenFor("BK-ZZZZZZ").token)).toBeNull();
    expect(await findBookingByManageToken("kort")).toBeNull();

    await sendDueNotifications({ now: new Date() });
    expect(outbox[0]?.text).toContain(`https://www.example.dk/booking/manage/${token}`);
  });

  it("kunder med konto får et link til Min konto i stedet", async () => {
    const user = await createUser();
    const booking = await paidBooking({ userId: user.id });
    expect(booking.manageTokenHash).toBeNull();
    await sendDueNotifications({ now: new Date() });
    expect(outbox[0]?.text).toContain(
      `https://www.example.dk/account/bookings/${booking.reference}`,
    );
  });
});

describe("Min konto", () => {
  it("gæstebookinger med samme e-mail knyttes til kontoen", async () => {
    const booking = await paidBooking();
    const user = await createUser();
    const sessionUser = { userId: user.id, email: user.email, name: user.name };

    expect(await claimGuestBookings(sessionUser)).toBe(1);
    expect(await claimGuestBookings(sessionUser)).toBe(0);
    const owner = await db.customer.findUniqueOrThrow({ where: { userId: user.id } });
    expect(await db.customer.count()).toBe(2); // kontoens kunde + flådens testkunde

    const { upcoming, past } = await customerBookings(user.id, now);
    expect(upcoming.map((row) => row.reference)).toEqual([booking.reference]);
    expect(past).toEqual([]);
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).customerId).toBe(
      owner.id,
    );

    const payments = await customerPayments(user.id);
    expect(payments).toMatchObject([{ kind: "CHARGE", reference: booking.reference }]);
  });

  it("andre e-mails knyttes ikke", async () => {
    await paidBooking();
    const user = await createUser("anden@example.com");
    expect(await claimGuestBookings({ userId: user.id, email: user.email, name: user.name })).toBe(
      0,
    );
    expect((await customerBookings(user.id, now)).upcoming).toEqual([]);
  });

  it("profilen valideres og opdaterer navn og sprog", async () => {
    const user = await createUser();
    const sessionUser = { userId: user.id, email: user.email };
    await expect(
      updateProfile(sessionUser, { firstName: "Mette", lastName: "", phone: "123", locale: "da" }),
    ).rejects.toMatchObject({ details: { fields: ["lastName", "phone"] } });

    await updateProfile(sessionUser, {
      firstName: "Mette",
      lastName: "Jensen",
      phone: "12 34 56 78",
      locale: "en",
    });
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      name: "Mette Jensen",
      locale: "en",
    });
    expect(await db.customer.findUniqueOrThrow({ where: { userId: user.id } })).toMatchObject({
      lastName: "Jensen",
      phoneE164: "+4512345678",
      preferredLocale: "en",
    });
  });
});
