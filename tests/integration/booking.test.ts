import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import type { CreateBookingRequest } from "@/lib/validation/booking";
import { createBooking } from "@/server/booking/create";
import { expireReservations } from "@/server/booking/expire";
import { transitionBooking } from "@/server/booking/state";
import { hashManageToken } from "@/server/booking/tokens";
import { db } from "@/server/db";
import { addPrices, bookingData, createFleet, resetDb } from "./helpers";

const { CRON_SECRET } = vi.hoisted(() => ({ CRON_SECRET: "test-cron-secret-0123456789" }));
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, serverEnv: () => ({ ...actual.serverEnv(), CRON_SECRET }) };
});

type Fleet = Awaited<ReturnType<typeof createFleet>>;
let fleet: Fleet;

const now = new Date("2026-05-01T08:00:00Z");
const MINUTE = 60_000;

function request(overrides: Partial<CreateBookingRequest> = {}): CreateBookingRequest {
  return {
    carModelId: fleet.carModel.id,
    pickupLocationId: fleet.location.id,
    returnLocationId: fleet.location.id,
    // Mandag 1. juni kl. 10 til torsdag 4. juni kl. 10 (dansk sommertid).
    pickupAt: "2026-06-01T10:00:00+02:00",
    returnAt: "2026-06-04T10:00:00+02:00",
    customer: { firstName: "Mette", lastName: "Hansen", email: "Mette@Example.com" },
    ...overrides,
  };
}

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return { code: error.code, details: error.details };
    throw error;
  }
  return null;
}

beforeEach(async () => {
  await resetDb();
  fleet = await createFleet();
  await addPrices(fleet);
  // Bil B har kørt længst; A tildeles først.
  await db.car.update({ where: { id: fleet.carB.id }, data: { odometerKm: 50_000 } });
});

describe("opret booking", () => {
  it("reserverer bilen i 15 minutter med serverens pris og klargøringsbuffer", async () => {
    const { booking, manageToken, replayed } = await createBooking(request(), { now });

    expect(replayed).toBe(false);
    expect(booking.status).toBe("PENDING_PAYMENT");
    expect(booking.reference).toMatch(/^BK-[2-9A-Z]{6}$/);
    expect(booking.carId).toBe(fleet.carA.id);
    expect(booking.totalMinor).toBe(99900);
    expect(booking.depositMinor).toBe(fleet.carModel.depositMinor);
    expect(booking.depositStatus).toBe("PENDING");
    expect(booking.expiresAt).toEqual(new Date(now.getTime() + 15 * MINUTE));
    // Lokationens standardbuffer: 60 min før og 120 min efter.
    expect(booking.blockedFrom).toEqual(new Date("2026-06-01T07:00:00Z"));
    expect(booking.blockedUntil).toEqual(new Date("2026-06-04T10:00:00Z"));

    // Gæst: tokenet gives én gang, kun hashen gemmes.
    expect(manageToken).toBeTruthy();
    expect(booking.manageTokenHash).toBe(hashManageToken(manageToken!));

    const customer = await db.customer.findUniqueOrThrow({ where: { id: booking.customerId } });
    expect(customer.email).toBe("mette@example.com");
    expect(customer.userId).toBeNull();

    const items = await db.bookingItem.findMany({ where: { bookingId: booking.id } });
    expect(items).toMatchObject([{ type: "RENTAL", totalMinor: 99900, currency: "DKK" }]);
    const events = await db.bookingStatusEvent.findMany({ where: { bookingId: booking.id } });
    expect(events).toMatchObject([{ fromStatus: null, toStatus: "PENDING_PAYMENT" }]);
  });

  it("næste kunde får den anden bil; derefter er modellen udsolgt", async () => {
    const first = await createBooking(request(), { now });
    const second = await createBooking(request(), { now });
    expect(second.booking.carId).toBe(fleet.carB.id);
    expect(first.booking.reference).not.toBe(second.booking.reference);

    const third = await errorOf(createBooking(request(), { now }));
    expect(third?.code).toBe("CAR_NO_LONGER_AVAILABLE");
  });

  it("ekstraudstyr gemmes med navnet på kundens sprog", async () => {
    await db.extra.create({
      data: {
        code: "child_seat",
        nameI18n: { da: "Barnestol", en: "Child seat" },
        pricing: "PER_BOOKING",
        priceMinor: 10000,
        maxQuantity: 2,
      },
    });
    const { booking } = await createBooking(
      request({ locale: "en", extras: [{ code: "child_seat", quantity: 2 }] }),
      { now },
    );
    expect(booking.totalMinor).toBe(99900 + 20000);
    const extra = await db.bookingItem.findFirstOrThrow({ where: { type: "EXTRA" } });
    expect(extra).toMatchObject({ labelSnapshot: "Child seat", quantity: 2, totalMinor: 20000 });
  });

  it("klargøringsbufferen blokerer tæt på hinanden liggende lejer", async () => {
    await db.car.update({ where: { id: fleet.carB.id }, data: { opStatus: "RETIRED" } });
    await createBooking(request(), { now });

    // Retur torsdag kl. 10 + 120 min buffer = 12:00. Næste afhentning kræver 60 min før.
    const tooClose = await errorOf(
      createBooking(
        request({ pickupAt: "2026-06-04T12:59:00+02:00", returnAt: "2026-06-05T12:59:00+02:00" }),
        { now },
      ),
    );
    expect(tooClose?.code).toBe("CAR_NO_LONGER_AVAILABLE");

    const justFits = await createBooking(
      request({ pickupAt: "2026-06-04T13:00:00+02:00", returnAt: "2026-06-05T13:00:00+02:00" }),
      { now },
    );
    expect(justFits.booking.carId).toBe(fleet.carA.id);
  });

  it("biler på værksted eller ude af drift tildeles ikke", async () => {
    await db.maintenance.create({
      data: {
        carId: fleet.carA.id,
        type: "SERVICE",
        startsAt: new Date("2026-06-02T08:00:00Z"),
        endsAt: new Date("2026-06-02T12:00:00Z"),
      },
    });
    await db.car.update({ where: { id: fleet.carB.id }, data: { opStatus: "OUT_OF_SERVICE" } });
    expect((await errorOf(createBooking(request(), { now })))?.code).toBe(
      "CAR_NO_LONGER_AVAILABLE",
    );
  });

  it("en udløbet reservation frigiver bilen", async () => {
    await db.car.update({ where: { id: fleet.carB.id }, data: { opStatus: "RETIRED" } });
    const first = await createBooking(request(), { now });

    const later = new Date(now.getTime() + 16 * MINUTE);
    const second = await createBooking(request(), { now: later });
    expect(second.booking.carId).toBe(fleet.carA.id);

    const expired = await db.booking.findUniqueOrThrow({ where: { id: first.booking.id } });
    expect(expired.status).toBe("EXPIRED");
    const events = await db.bookingStatusEvent.findMany({
      where: { bookingId: first.booking.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((event) => event.toStatus)).toEqual(["PENDING_PAYMENT", "EXPIRED"]);
  });

  it("lukket, for tidligt eller ugyldigt afvises", async () => {
    await db.openingHours.createMany({
      data: [1, 2, 3, 4, 5, 6].map((weekday) => ({
        locationId: fleet.location.id,
        weekday,
        opensAt: "08:00",
        closesAt: "18:00",
      })),
    });
    const sunday = await errorOf(
      createBooking(request({ pickupAt: "2026-05-31T10:00:00+02:00" }), { now }),
    );
    expect(sunday).toEqual({
      code: "OUTSIDE_OPENING_HOURS",
      details: { field: "pickupAt", locationId: fleet.location.id },
    });
    const night = await errorOf(
      createBooking(request({ returnAt: "2026-06-04T20:00:00+02:00" }), { now }),
    );
    expect(night?.details?.field).toBe("returnAt");

    const soon = await errorOf(
      createBooking(request({ pickupAt: "2026-05-01T11:00:00+02:00" }), { now }),
    );
    expect(soon?.details).toMatchObject({ reason: "TOO_SOON" });

    const invalid = await errorOf(
      createBooking(
        request({
          customer: { firstName: "", lastName: "X", email: "ikke-en-mail" },
          delivery: { distanceKm: 5 },
        }),
        { now },
      ),
    );
    expect(invalid?.details?.fields).toEqual([
      "customer.firstName",
      "customer.email",
      "deliveryAddress",
    ]);
    expect(await db.booking.count()).toBe(0);
  });

  it("kunde med konto: kundeposten genbruges, og der er intet gæste-token", async () => {
    const user = await db.user.create({ data: { email: "mette@example.com", name: "Mette" } });
    const first = await createBooking(request(), { now, userId: user.id });
    const second = await createBooking(
      request({ customer: { firstName: "Mette", lastName: "Holm", email: "mette@example.com" } }),
      { now, userId: user.id },
    );
    expect(first.manageToken).toBeNull();
    expect(first.booking.manageTokenHash).toBeNull();
    expect(second.booking.customerId).toBe(first.booking.customerId);
    const customer = await db.customer.findUniqueOrThrow({ where: { userId: user.id } });
    expect(customer.lastName).toBe("Holm");
    const event = await db.bookingStatusEvent.findFirstOrThrow({
      where: { bookingId: first.booking.id },
    });
    expect(event.actorUserId).toBe(user.id);
  });
});

describe("samtidighed", () => {
  it("20 samtidige bookinger af én ledig bil: præcis 1 lykkes", async () => {
    await db.car.update({ where: { id: fleet.carB.id }, data: { opStatus: "RETIRED" } });
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        createBooking(
          request({ customer: { firstName: "K", lastName: `${i}`, email: `k${i}@example.com` } }),
          { now },
        ),
      ),
    );
    const ok = results.filter((result) => result.status === "fulfilled");
    const failed = results.filter((result) => result.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(
      failed.every((result) => (result.reason as AppError).code === "CAR_NO_LONGER_AVAILABLE"),
    ).toBe(true);
    expect(await db.booking.count()).toBe(1);
    // Tabernes kundeposter blev rullet tilbage sammen med bookingen.
    expect(await db.customer.count({ where: { email: { startsWith: "k" } } })).toBe(1);
  });

  it("20 samtidige bookinger af en model med 2 biler: præcis 2 lykkes, på hver sin bil", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => createBooking(request(), { now })),
    );
    const ok = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    expect(ok).toHaveLength(2);
    expect(new Set(ok.map((created) => created.booking.carId)).size).toBe(2);
  });
});

describe("Idempotency-Key", () => {
  it("samme nøgle giver samme booking, også ved samtidige forsøg", async () => {
    const key = "4f6c1e9a-8a3b-4c11-9d2e-6b7a1c0e5f42";
    const results = await Promise.all(
      Array.from({ length: 5 }, () => createBooking(request({ idempotencyKey: key }), { now })),
    );
    expect(new Set(results.map((created) => created.booking.id)).size).toBe(1);
    expect(results.filter((created) => !created.replayed)).toHaveLength(1);
    expect(results.filter((created) => created.manageToken !== null)).toHaveLength(1);
    expect(await db.booking.count()).toBe(1);
  });

  it("nøglen kan ikke genbruges til en anden booking", async () => {
    const key = "genbrugt-noegle-123";
    await createBooking(request({ idempotencyKey: key }), { now });
    const other = await errorOf(
      createBooking(
        request({
          idempotencyKey: key,
          customer: { firstName: "A", lastName: "B", email: "andre@example.com" },
        }),
        { now },
      ),
    );
    expect(other?.code).toBe("CONFLICT");
  });
});

describe("status", () => {
  it("betaling bekræfter reservationen og fjerner fristen", async () => {
    const { booking } = await createBooking(request(), { now });
    const confirmed = await transitionBooking(booking.id, "CONFIRMED", { reason: "payment" });
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.expiresAt).toBeNull();
    // Bekræftede bookinger udløber ikke.
    expect(await expireReservations(new Date("2027-01-01T00:00:00Z"))).toBe(0);

    const invalid = await errorOf(transitionBooking(booking.id, "COMPLETED"));
    expect(invalid).toMatchObject({ code: "CONFLICT", details: { from: "CONFIRMED" } });
  });

  it("samtidige statusskift: kun ét lykkes", async () => {
    const { booking } = await createBooking(request(), { now });
    const results = await Promise.allSettled([
      transitionBooking(booking.id, "CONFIRMED"),
      transitionBooking(booking.id, "CANCELLED"),
      transitionBooking(booking.id, "EXPIRED"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.bookingStatusEvent.count({ where: { bookingId: booking.id } })).toBe(2);
  });

  it("betaling efter udløb: genaktiveres kun, hvis bilen stadig er ledig", async () => {
    await db.car.update({ where: { id: fleet.carB.id }, data: { opStatus: "RETIRED" } });
    const { booking } = await createBooking(request(), { now });
    await expireReservations(new Date(now.getTime() + 16 * MINUTE));

    // Bilen er stadig ledig: bookingen genaktiveres.
    expect((await transitionBooking(booking.id, "CONFIRMED")).status).toBe("CONFIRMED");

    // Ny reservation, der udløber, mens en anden kunde tager bilen.
    const late = await createBooking(
      request({ pickupAt: "2026-07-01T10:00:00+02:00", returnAt: "2026-07-03T10:00:00+02:00" }),
      { now },
    );
    await expireReservations(new Date(now.getTime() + 16 * MINUTE));
    await db.booking.create({
      data: bookingData(fleet, fleet.carA.id, "2026-07-02T08:00:00Z", "2026-07-02T18:00:00Z"),
    });
    expect((await errorOf(transitionBooking(late.booking.id, "CONFIRMED")))?.code).toBe(
      "CAR_NO_LONGER_AVAILABLE",
    );
  });
});

describe("cron: udløb af reservationer", () => {
  it("kræver CRON_SECRET og udløber forfaldne reservationer", async () => {
    const { GET } = await import("@/app/api/cron/expire-reservations/route");
    const url = "http://localhost/api/cron/expire-reservations";

    expect((await GET(new Request(url))).status).toBe(401);
    expect(
      (await GET(new Request(url, { headers: { authorization: "Bearer forkert" } }))).status,
    ).toBe(401);

    const stale = await db.booking.create({
      data: {
        ...bookingData(fleet, fleet.carB.id, "2026-08-01T08:00:00Z", "2026-08-02T08:00:00Z"),
        status: "PENDING_PAYMENT",
        expiresAt: new Date(Date.now() - MINUTE),
      },
    });
    const response = await GET(
      new Request(url, { headers: { authorization: `Bearer ${CRON_SECRET}` } }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).expired).toBeGreaterThanOrEqual(1);
    expect((await db.booking.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe(
      "EXPIRED",
    );
  });
});
