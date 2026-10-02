import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { statistics } from "@/server/admin/stats";
import type { PolicyContext } from "@/server/auth/policies";
import { db } from "@/server/db";
import { bookingData, createFleet, resetDb } from "./helpers";

type Fleet = Awaited<ReturnType<typeof createFleet>>;
let fleet: Fleet;

async function actor(role: Role, email: string): Promise<PolicyContext> {
  const user = await db.user.create({
    data: { email, name: role, role, emailVerified: true },
  });
  return { actor: { userId: user.id, role, twoFactorEnabled: true } };
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return { code: error.code, details: error.details };
    throw error;
  }
  throw new Error("forventede en fejl");
}

/** Booking oprettet på `createdAt` med evt. betalinger samme tidspunkt. */
async function booking(
  carId: string,
  from: string,
  to: string,
  options: {
    status: "COMPLETED" | "CONFIRMED" | "CANCELLED" | "EXPIRED";
    createdAt: string;
    totalMinor: number;
    customerId?: string;
    payments?: { kind: "CHARGE" | "MANUAL" | "REFUND"; amountMinor: number }[];
  },
) {
  const created = await db.booking.create({
    data: {
      ...bookingData(fleet, carId, from, to, { status: options.status }),
      customerId: options.customerId ?? fleet.customer.id,
      totalMinor: options.totalMinor,
      subtotalMinor: options.totalMinor,
      createdAt: new Date(options.createdAt),
    },
  });
  for (const payment of options.payments ?? []) {
    await db.payment.create({
      data: {
        bookingId: created.id,
        kind: payment.kind,
        status: "SUCCEEDED",
        amountMinor: payment.amountMinor,
        currency: "DKK",
        createdAt: new Date(options.createdAt),
      },
    });
  }
  return created;
}

beforeEach(async () => {
  await resetDb();
  fleet = await createFleet();
  // Bilerne har været i flåden hele perioden.
  await db.car.updateMany({ data: { createdAt: new Date("2026-01-01T00:00:00Z") } });
});

describe("statistik (M14)", () => {
  it("omsætning, bookinger, belægning, annulleringer og gentagne kunder", async () => {
    const manager = await actor("MANAGER", "leder@example.com");
    const other = await db.customer.create({
      data: { firstName: "Omar", lastName: "Karim", email: "omar@example.com" },
    });
    // Før perioden: gør Anna til gentagen kunde. Betalingen tæller ikke i marts.
    await booking(fleet.carA.id, "2026-02-02T10:00:00Z", "2026-02-04T10:00:00Z", {
      status: "COMPLETED",
      createdAt: "2026-02-01T12:00:00Z",
      totalMinor: 80000,
      payments: [{ kind: "CHARGE", amountMinor: 80000 }],
    });
    // 48 timer i perioden.
    await booking(fleet.carA.id, "2026-03-02T10:00:00Z", "2026-03-04T10:00:00Z", {
      status: "COMPLETED",
      createdAt: "2026-03-01T12:00:00Z",
      totalMinor: 99900,
      payments: [{ kind: "CHARGE", amountMinor: 99900 }],
    });
    // Annulleret og refunderet.
    await booking(fleet.carB.id, "2026-03-06T10:00:00Z", "2026-03-07T10:00:00Z", {
      status: "CANCELLED",
      createdAt: "2026-03-05T12:00:00Z",
      totalMinor: 50000,
      payments: [
        { kind: "CHARGE", amountMinor: 50000 },
        { kind: "REFUND", amountMinor: 50000 },
      ],
    });
    // Rækker ud over perioden: kun 12 timer tæller (perioden slutter 10/3 kl. 24 dansk tid).
    await booking(fleet.carB.id, "2026-03-10T11:00:00Z", "2026-03-12T11:00:00Z", {
      status: "CONFIRMED",
      createdAt: "2026-03-06T12:00:00Z",
      totalMinor: 150000,
      customerId: other.id,
      payments: [{ kind: "MANUAL", amountMinor: 150000 }],
    });
    // Udløbet kurv tæller ikke.
    await booking(fleet.carA.id, "2026-04-02T10:00:00Z", "2026-04-04T10:00:00Z", {
      status: "EXPIRED",
      createdAt: "2026-03-07T12:00:00Z",
      totalMinor: 70000,
    });

    const stats = await statistics(manager, { from: "2026-03-01", to: "2026-03-10" });
    expect(stats).toMatchObject({
      currency: "DKK",
      revenueMinor: 99900 + 50000 + 150000 - 50000,
      refundsMinor: 50000,
      bookings: 3,
      cancelled: 1,
      noShows: 0,
      averageValueMinor: 124950,
      cars: 2,
      customers: 2,
      repeatCustomers: 1,
    });
    expect(stats.cancellationRate).toBeCloseTo(1 / 3);
    // 60 udlejede timer af 2 biler × 240 timer.
    expect(stats.occupancy).toBeCloseTo(60 / 480);
    expect(stats.popularModels).toEqual([
      { id: fleet.carModel.id, name: "Test Model", bookings: 2, valueMinor: 249900 },
    ]);
    expect(stats.popularCategories).toEqual([
      expect.objectContaining({ name: "Economy", bookings: 2, valueMinor: 249900 }),
    ]);

    // En anden lokation har intet.
    const elsewhere = await db.location.create({
      data: {
        slug: "andet",
        name: "Andet",
        address: "Vej 2",
        postalCode: "8000",
        city: "Aarhus",
        lat: 56.15,
        lng: 10.2,
      },
    });
    expect(
      await statistics(manager, { from: "2026-03-01", to: "2026-03-10", location: elsewhere.id }),
    ).toMatchObject({ bookings: 0, revenueMinor: 0, occupancy: 0, cars: 0, popularModels: [] });
  });

  it("kræver MANAGER og en gyldig periode", async () => {
    const staff = await actor("STAFF", "medarbejder@example.com");
    const manager = await actor("MANAGER", "leder@example.com");
    expect((await failure(statistics(staff, { from: "2026-03-01", to: "2026-03-10" }))).code).toBe(
      "FORBIDDEN",
    );
    expect(
      await failure(statistics(manager, { from: "2026-03-10", to: "2026-03-01" })),
    ).toMatchObject({ code: "VALIDATION_FAILED", details: { fields: ["to"] } });
    expect(
      await failure(statistics(manager, { from: "2025-01-01", to: "2026-03-01" })),
    ).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(
      await failure(statistics(manager, { from: "2026-03-01", to: "2026-03-10", location: "x" })),
    ).toMatchObject({ details: { fields: ["location"] } });
  });
});
