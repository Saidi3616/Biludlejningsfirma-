import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateBookingRequest } from "@/lib/validation/booking";
import { createBooking } from "@/server/booking/create";
import { transitionBooking } from "@/server/booking/state";
import { db } from "@/server/db";
import { captureEmails, useEmailTransportForTests, type Email } from "@/server/email/send";
import { sendDueNotifications } from "@/server/notifications/dispatch";
import { fakeProvider } from "@/server/payments/providers/fake";
import { handlePaymentWebhook, startPayment } from "@/server/payments/service";
import { addPrices, createFleet, resetDb } from "./helpers";

const { CRON_SECRET } = vi.hoisted(() => ({ CRON_SECRET: "test-cron-secret-0123456789" }));
const whatsapp = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    serverEnv: () => ({
      ...actual.serverEnv(),
      CRON_SECRET,
      AUTH_URL: "https://www.example.dk",
      WHATSAPP_TOKEN: whatsapp.token,
      WHATSAPP_PHONE_NUMBER_ID: whatsapp.token ? "1234567890" : undefined,
    }),
  };
});

type Fleet = Awaited<ReturnType<typeof createFleet>>;
let fleet: Fleet;
let outbox: Email[];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
// Bookingen oprettes "nu"; afhentning om 3 dage, aflevering 3 dage senere. Webhooken planlægger
// beskederne efter det rigtige ur, så afsendelse testes med `new Date()`.
const now = new Date();
const pickupAt = new Date(Math.ceil((now.getTime() + 3 * 24 * HOUR) / HOUR) * HOUR);
const returnAt = new Date(pickupAt.getTime() + 3 * 24 * HOUR);

function request(overrides: Partial<CreateBookingRequest> = {}): CreateBookingRequest {
  return {
    carModelId: fleet.carModel.id,
    pickupLocationId: fleet.location.id,
    returnLocationId: fleet.location.id,
    pickupAt,
    returnAt,
    customer: {
      firstName: "Mette",
      lastName: "Hansen",
      email: "mette@example.com",
      phoneE164: "+4512345678",
    },
    ...overrides,
  };
}

/** Booking → betaling → webhook, som i det rigtige flow. */
async function paidBooking(overrides: Partial<CreateBookingRequest> = {}) {
  const { booking } = await createBooking(request(overrides), { now });
  await startPayment(booking.id, now);
  const payment = await db.payment.findFirstOrThrow({ where: { bookingId: booking.id } });
  const { body, signature } = fakeProvider.signedEvent(
    payment.providerRef!,
    "succeeded",
    payment.amountMinor,
    "DKK",
  );
  await handlePaymentWebhook(body, signature);
  return booking;
}

beforeEach(async () => {
  await resetDb();
  fleet = await createFleet();
  await addPrices(fleet);
  // Testlokationen har åbent døgnet rundt, så de relative tider altid kan bookes.
  await db.openingHours.deleteMany({ where: { locationId: fleet.location.id } });
  await db.openingHours.createMany({
    data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      locationId: fleet.location.id,
      weekday,
      opensAt: "00:00",
      closesAt: "23:59",
    })),
  });
  whatsapp.token = undefined;
  outbox = captureEmails();
});

afterEach(() => {
  useEmailTransportForTests(undefined);
  vi.unstubAllGlobals();
});

describe("udbakke", () => {
  it("betalt booking: bekræftelse nu, påmindelser planlagt; webhook igen giver ingen dubletter", async () => {
    const booking = await paidBooking();
    const rows = await db.notification.findMany({ orderBy: { scheduledAt: "asc" } });
    expect(rows.map((row) => [row.template, row.channel])).toEqual([
      ["BOOKING_CONFIRMED", "EMAIL"],
      ["PICKUP_REMINDER", "EMAIL"],
      ["RETURN_REMINDER", "EMAIL"],
    ]);
    expect(rows[1]!.scheduledAt).toEqual(new Date(pickupAt.getTime() - 24 * HOUR));
    expect(rows[2]!.scheduledAt).toEqual(new Date(returnAt.getTime() - 3 * HOUR));
    // Ingen persondata i udbakken.
    expect(rows.every((row) => JSON.stringify(row.payload) === "{}")).toBe(true);
    expect(rows.every((row) => row.bookingId === booking.id)).toBe(true);
  });

  it("med WhatsApp sat op og et mobilnummer skrives en række pr. kanal", async () => {
    whatsapp.token = "test-token";
    await paidBooking();
    const confirmed = await db.notification.findMany({ where: { template: "BOOKING_CONFIRMED" } });
    expect(confirmed.map((row) => row.channel).sort()).toEqual(["EMAIL", "WHATSAPP"]);
  });

  it("afsluttet leje giver tak nu og anmodning om anmeldelse et døgn efter", async () => {
    const booking = await paidBooking();
    await transitionBooking(booking.id, "ACTIVE", { now });
    await transitionBooking(booking.id, "COMPLETED", { now });
    const rows = await db.notification.findMany({
      where: { template: { in: ["THANK_YOU", "REVIEW_REQUEST"] } },
      orderBy: { scheduledAt: "asc" },
    });
    expect(rows.map((row) => row.template)).toEqual(["THANK_YOU", "REVIEW_REQUEST"]);
    expect(rows[1]!.scheduledAt.getTime() - rows[0]!.scheduledAt.getTime()).toBe(24 * HOUR);
  });
});

describe("afsendelse", () => {
  it("sender kun forfaldne beskeder, på kundens sprog, og kun én gang", async () => {
    await paidBooking({ locale: "en" });
    expect(await sendDueNotifications({ now: new Date() })).toEqual({
      sent: 1,
      retry: 0,
      failed: 0,
      skipped: 0,
    });
    expect(outbox).toHaveLength(1);
    const [email] = outbox;
    expect(email!.to).toBe("mette@example.com");
    expect(email!.subject).toMatch(/^Your booking BK-[A-Z0-9]{6} is confirmed$/);
    expect(email!.text).toContain("Test Model");
    expect(email!.html).toContain('lang="en"');

    // Næste kørsel sender intet nyt; påmindelsen sendes først, når den er forfalden.
    await sendDueNotifications({ now: new Date() });
    expect(outbox).toHaveLength(1);
    await sendDueNotifications({ now: new Date(pickupAt.getTime() - 24 * HOUR) });
    expect(outbox.map((mail) => mail.subject)).toEqual([
      email!.subject,
      "Reminder: you pick up your car soon",
    ]);
  });

  it("to samtidige kørsler sender ikke den samme besked to gange", async () => {
    await paidBooking();
    const results = await Promise.all([
      sendDueNotifications({ now: new Date() }),
      sendDueNotifications({ now: new Date() }),
    ]);
    expect(results.reduce((sum, result) => sum + result.sent, 0)).toBe(1);
    expect(outbox).toHaveLength(1);
  });

  it("e-mailfejl påvirker ikke bookingen; der prøves igen med pause og til sidst FAILED", async () => {
    const booking = await paidBooking();
    useEmailTransportForTests({
      name: "broken",
      send: async () => {
        throw new Error("E-mailudbyder svarede 503");
      },
    });

    let time = new Date();
    const statuses: string[] = [];
    for (let attempt = 1; attempt <= 5; attempt++) {
      const result = await sendDueNotifications({ now: time });
      statuses.push(Object.entries(result).find(([, count]) => count > 0)![0]);
      const row = await db.notification.findFirstOrThrow({
        where: { template: "BOOKING_CONFIRMED" },
      });
      expect(row.attempts).toBe(attempt);
      // Før næste pause er gået, sker der intet.
      expect((await sendDueNotifications({ now: time })).retry).toBe(0);
      time = row.nextAttemptAt;
    }
    expect(statuses).toEqual(["retry", "retry", "retry", "retry", "failed"]);
    const row = await db.notification.findFirstOrThrow({
      where: { template: "BOOKING_CONFIRMED" },
    });
    expect(row).toMatchObject({ status: "FAILED", lastError: "E-mailudbyder svarede 503" });
    const saved = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(saved).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID" });
  });

  it("en fejl, der går over, sendes ved næste forsøg", async () => {
    await paidBooking();
    let calls = 0;
    useEmailTransportForTests({
      name: "flaky",
      send: async (email) => {
        calls += 1;
        if (calls === 1) throw new Error("timeout");
        outbox.push(email);
      },
    });
    expect((await sendDueNotifications({ now: new Date() })).retry).toBe(1);
    expect((await sendDueNotifications({ now: new Date(Date.now() + MINUTE) })).sent).toBe(1);
    expect(outbox).toHaveLength(1);
  });

  it("påmindelser til en annulleret booking springes over", async () => {
    const booking = await paidBooking();
    await sendDueNotifications({ now: new Date() });
    await transitionBooking(booking.id, "CANCELLED", { now });
    const result = await sendDueNotifications({ now: new Date(returnAt.getTime()) });
    expect(result).toMatchObject({ sent: 0, skipped: 2 });
    expect(outbox).toHaveLength(1);
  });

  it("WhatsApp sendes som godkendt skabelon via Cloud API", async () => {
    whatsapp.token = "test-token";
    const fetchMock = vi.fn(async () => Response.json({ messages: [{ id: "wamid.123" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const booking = await paidBooking();
    await sendDueNotifications({ now: new Date() });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v21.0/1234567890/messages");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      to: "4512345678",
      type: "template",
      template: { name: "booking_confirmed", language: { code: "da" } },
    });
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual([
      "Mette",
      booking.reference,
      "Test Model",
      expect.any(String),
      "Test",
    ]);
    const row = await db.notification.findFirstOrThrow({
      where: { channel: "WHATSAPP", template: "BOOKING_CONFIRMED" },
    });
    expect(row).toMatchObject({ status: "SENT", providerMessageId: "wamid.123" });
  });

  it("cron-endpointet kræver nøglen", async () => {
    const { GET } = await import("@/app/api/cron/notifications/route");
    const denied = await GET(new Request("http://localhost/api/cron/notifications"));
    expect(denied.status).toBe(401);
    const allowed = await GET(
      new Request("http://localhost/api/cron/notifications", {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    expect(allowed.status).toBe(200);
  });
});
