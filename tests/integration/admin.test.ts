import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { bookingFilterSchema, listBookings, adminBooking } from "@/server/admin/bookings";
import { adminCalendar, calendarFilterSchema } from "@/server/admin/calendar";
import { adminCustomer, customerFilterSchema, listCustomers } from "@/server/admin/customers";
import { adminDashboard } from "@/server/admin/dashboard";
import { sendCustomerMessage } from "@/server/admin/messages";
import type { PolicyContext } from "@/server/auth/policies";
import { db } from "@/server/db";
import { captureEmails, useEmailTransportForTests, type Email } from "@/server/email/send";
import { bookingData, createFleet, resetDb } from "./helpers";

type Fleet = Awaited<ReturnType<typeof createFleet>>;
let fleet: Fleet;
let outbox: Email[];

// Mandag 15. juni 2026 kl. 10 i København (sommertid, UTC+2).
const now = new Date("2026-06-15T08:00:00Z");

async function staff(role: Role = "STAFF"): Promise<PolicyContext> {
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

beforeEach(async () => {
  await resetDb();
  fleet = await createFleet();
  outbox = captureEmails();
});

afterEach(() => {
  useEmailTransportForTests(undefined);
});

/** Bil A hentes i dag kl. 12 (ubetalt), bil B er udlejet og afleveres i dag kl. 16. */
async function todaysBookings() {
  const pickup = await db.booking.create({
    data: {
      ...bookingData(fleet, fleet.carA.id, "2026-06-15T10:00:00Z", "2026-06-18T10:00:00Z"),
      reference: "BK-PICKUP",
    },
  });
  const active = await db.booking.create({
    data: {
      ...bookingData(fleet, fleet.carB.id, "2026-06-12T10:00:00Z", "2026-06-15T14:00:00Z", {
        status: "ACTIVE",
      }),
      reference: "BK-RETURN",
      paymentStatus: "PAID",
    },
  });
  return { pickup, active };
}

describe("overblik", () => {
  it("viser dagens afhentninger og afleveringer i tidsrækkefølge og tæller biler", async () => {
    await todaysBookings();
    // En booking i morgen tæller ikke med i dag.
    await db.booking.create({
      data: bookingData(fleet, fleet.carA.id, "2026-06-20T10:00:00Z", "2026-06-21T10:00:00Z"),
    });
    const data = await adminDashboard(await staff(), { now });

    expect(data.today).toBe("2026-06-15");
    expect(data.timeline.map((row) => [row.kind, row.reference])).toEqual([
      ["pickup", "BK-PICKUP"],
      ["return", "BK-RETURN"],
    ]);
    expect(data.timeline[0]).toMatchObject({
      customerName: "Anna Jensen",
      registration: fleet.carA.registrationNumber,
      timeZone: "Europe/Copenhagen",
    });
    // Bil A er ledig indtil kl. 12; bil B er udlejet.
    expect(data.counts).toEqual({ pickups: 1, returns: 1, active: 1, available: 1, inService: 0 });
    expect(data.attention).toMatchObject({ unpaid: 2, pendingRefunds: 0 });
  });

  it("omsætning vises kun for ledere og trækker refusioner fra", async () => {
    const { active } = await todaysBookings();
    await db.customer.update({ where: { id: fleet.customer.id }, data: { createdAt: now } });
    await db.payment.createMany({
      data: [
        {
          bookingId: active.id,
          kind: "CHARGE",
          status: "SUCCEEDED",
          amountMinor: 99900,
          currency: "DKK",
          createdAt: now,
        },
        {
          bookingId: active.id,
          kind: "REFUND",
          status: "SUCCEEDED",
          amountMinor: 10000,
          currency: "DKK",
          createdAt: now,
        },
        {
          bookingId: active.id,
          kind: "CHARGE",
          status: "FAILED",
          amountMinor: 50000,
          currency: "DKK",
          createdAt: now,
        },
      ],
    });

    expect((await adminDashboard(await staff("STAFF"), { now })).kpi).toBeNull();
    const kpi = (await adminDashboard(await staff("MANAGER"), { now })).kpi;
    // Den ubetalte booking på bil A (999 kr.) er udestående.
    expect(kpi).toEqual({
      revenueMinor: 89900,
      outstandingMinor: 99900,
      newCustomers: 1,
      currency: "DKK",
    });
  });

  it("kræver adgang til adminpanelet", async () => {
    await expect(adminDashboard({ actor: null }, { now })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await expect(adminDashboard(await staff("CUSTOMER"), { now })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("bookingliste", () => {
  it("søger på reference, navn, e-mail, telefon og nummerplade og skjuler udløbne", async () => {
    await todaysBookings();
    await db.customer.update({
      where: { id: fleet.customer.id },
      data: { phoneE164: "+4512345678" },
    });
    await db.booking.create({
      data: {
        ...bookingData(fleet, fleet.carA.id, "2026-07-01T10:00:00Z", "2026-07-02T10:00:00Z", {
          status: "EXPIRED",
        }),
        reference: "BK-OLD",
      },
    });
    const ctx = await staff();
    const search = async (input: Record<string, string>) =>
      (await listBookings(ctx, bookingFilterSchema.parse(input))).rows.map((row) => row.reference);

    expect(await search({})).toEqual(["BK-PICKUP", "BK-RETURN"]);
    expect(await search({ q: "bk-ret" })).toEqual(["BK-RETURN"]);
    expect(await search({ q: "anna jensen" })).toHaveLength(2);
    expect(await search({ q: "jensen mette" })).toEqual([]);
    expect(await search({ q: "ANNA@example" })).toHaveLength(2);
    expect(await search({ q: "12 34 56" })).toHaveLength(2);
    expect(await search({ q: fleet.carB.registrationNumber.toLowerCase() })).toEqual(["BK-RETURN"]);
    expect(await search({ status: "EXPIRED" })).toEqual(["BK-OLD"]);
    expect(await search({ status: "ACTIVE" })).toEqual(["BK-RETURN"]);
    // Ugyldige filtre ignoreres i stedet for at give en fejl.
    expect(await search({ status: "NOPE", location: "x", page: "-1" })).toHaveLength(2);
  });

  it("bookingdetaljen findes uanset store og små bogstaver", async () => {
    await todaysBookings();
    const booking = await adminBooking(await staff(), "bk-pickup");
    expect(booking.reference).toBe("BK-PICKUP");
    await expect(adminBooking(await staff("MANAGER"), "BK-NOPE")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("kunder", () => {
  it("søger på navn og viser kundens bookinger", async () => {
    await todaysBookings();
    await db.customer.create({
      data: { firstName: "Bo", lastName: "Holm", email: "bo@example.com" },
    });
    const ctx = await staff();
    const list = await listCustomers(ctx, customerFilterSchema.parse({ q: "anna" }));
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]?._count.bookings).toBe(2);

    const customer = await adminCustomer(ctx, fleet.customer.id);
    expect(customer.bookings).toHaveLength(2);
    await expect(adminCustomer(ctx, "ikke-et-id")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("kalender", () => {
  it("viser bookinger og service, der overlapper ugen, men ikke annullerede", async () => {
    await todaysBookings();
    await db.booking.create({
      data: {
        ...bookingData(fleet, fleet.carA.id, "2026-06-19T10:00:00Z", "2026-06-20T10:00:00Z", {
          status: "CANCELLED",
        }),
        reference: "BK-CANCELLED",
      },
    });
    await db.maintenance.create({
      data: {
        carId: fleet.carB.id,
        type: "SERVICE",
        startsAt: new Date("2026-06-16T06:00:00Z"),
        endsAt: new Date("2026-06-16T14:00:00Z"),
      },
    });
    const data = await adminCalendar(
      await staff(),
      calendarFilterSchema.parse({ start: "2026-06-15", days: "7" }),
      now,
    );
    expect(data.dayKeys).toHaveLength(7);
    expect(data.previousStart).toBe("2026-06-08");
    expect(data.nextStart).toBe("2026-06-22");
    const [carA, carB] = data.cars;
    expect(carA?.bookings.map((b) => b.reference)).toEqual(["BK-PICKUP"]);
    expect(carB?.bookings.map((b) => b.reference)).toEqual(["BK-RETURN"]);
    expect(carB?.maintenance.map((m) => m.type)).toEqual(["SERVICE"]);

    // Ugyldige værdier giver standardvisningen (i dag, 7 dage).
    const fallback = calendarFilterSchema.parse({ start: "i går", days: "30" });
    expect((await adminCalendar(await staff("MANAGER"), fallback, now)).startKey).toBe(
      "2026-06-15",
    );
  });
});

describe("send besked til kunden", () => {
  it("sender en e-mail og gemmer beskeden og audit-loggen", async () => {
    const { pickup } = await todaysBookings();
    const ctx = await staff();
    await sendCustomerMessage(
      ctx,
      { bookingId: pickup.id },
      {
        subject: "Om din afhentning",
        body: "Hej igen.\n\nBilen står på plads 4.",
      },
    );

    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ to: "anna@example.com", subject: "Om din afhentning" });
    expect(outbox[0]?.text).toContain("Bilen står på plads 4.");
    const message = await db.message.findFirstOrThrow({ where: { bookingId: pickup.id } });
    expect(message).toMatchObject({
      direction: "OUTBOUND",
      channel: "EMAIL",
      status: "ANSWERED",
      customerId: fleet.customer.id,
      assignedUserId: ctx.actor!.userId,
    });
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "message.send" } });
    expect(log).toMatchObject({ actorUserId: ctx.actor!.userId, entityId: pickup.id });
  });

  it("afviser tomme felter, manglende rettighed og anonymiserede kunder", async () => {
    const { pickup } = await todaysBookings();
    const ctx = await staff();
    await expect(
      sendCustomerMessage(ctx, { bookingId: pickup.id }, { subject: " ", body: "" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: { fields: ["subject", "body"] },
    });
    await expect(
      sendCustomerMessage(
        await staff("CUSTOMER"),
        { bookingId: pickup.id },
        { subject: "a", body: "b" },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await db.customer.update({ where: { id: fleet.customer.id }, data: { anonymizedAt: now } });
    await expect(
      sendCustomerMessage(ctx, { bookingId: pickup.id }, { subject: "a", body: "b" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(outbox).toHaveLength(0);
    expect(await db.message.count()).toBe(0);
  });
});
