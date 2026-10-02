import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { addDaysToKey, localDateKey, localDayBounds } from "@/lib/dates";
import { assertCan, can, type PolicyContext } from "@/server/auth/policies";
import { db } from "@/server/db";

/** Admin regner "i dag" og "denne måned" i virksomhedens tidszone. */
export const ADMIN_TIME_ZONE = "Europe/Copenhagen";

/** Bookinger, der holder en bil (samme regel som databasens overlap-constraint). */
export function blockingBooking(now: Date): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: { in: ["CONFIRMED", "ACTIVE"] } },
      { status: "PENDING_PAYMENT", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    ],
  };
}

const timelineSelect = {
  reference: true,
  status: true,
  paymentStatus: true,
  pickupAt: true,
  returnAt: true,
  customer: { select: { firstName: true, lastName: true, phoneE164: true } },
  carModel: { select: { brand: true, model: true } },
  car: { select: { registrationNumber: true } },
  pickupLocation: { select: { name: true, timezone: true } },
  returnLocation: { select: { name: true, timezone: true } },
} satisfies Prisma.BookingSelect;

type TimelineBooking = Prisma.BookingGetPayload<{ select: typeof timelineSelect }>;

export type TimelineEntry = {
  kind: "pickup" | "return";
  at: Date;
  timeZone: string;
  location: string;
  reference: string;
  status: TimelineBooking["status"];
  paymentStatus: TimelineBooking["paymentStatus"];
  customerName: string;
  phone: string | null;
  carName: string;
  registration: string;
};

function entry(kind: TimelineEntry["kind"], booking: TimelineBooking): TimelineEntry {
  const place = kind === "pickup" ? booking.pickupLocation : booking.returnLocation;
  return {
    kind,
    at: kind === "pickup" ? booking.pickupAt : booking.returnAt,
    timeZone: place.timezone,
    location: place.name,
    reference: booking.reference,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    customerName: `${booking.customer.firstName} ${booking.customer.lastName}`,
    phone: booking.customer.phoneE164,
    carName: `${booking.carModel.brand} ${booking.carModel.model}`,
    registration: booking.car.registrationNumber,
  };
}

/**
 * "Hvad skal jeg gøre i dag?" (06-admin-flows.md, F0): dagens afhentninger og afleveringer,
 * nøgletal og det, der kræver handling. Omsætning kun for MANAGER+ (stats:read).
 */
export async function adminDashboard(
  ctx: PolicyContext,
  options: { locationId?: string | null; now?: Date } = {},
) {
  assertCan(ctx, "booking:read");
  const now = options.now ?? new Date();
  const today = localDateKey(now, ADMIN_TIME_ZONE);
  const { start, end } = localDayBounds(today, ADMIN_TIME_ZONE);
  const locationId = options.locationId ?? undefined;
  const live = { status: { in: ["CONFIRMED", "ACTIVE"] } } satisfies Prisma.BookingWhereInput;

  const [pickups, returns, active, available, inService, unpaid, failed, newMessages, refunds] =
    await Promise.all([
      db.booking.findMany({
        where: { ...live, pickupAt: { gte: start, lt: end }, pickupLocationId: locationId },
        select: timelineSelect,
      }),
      db.booking.findMany({
        where: { ...live, returnAt: { gte: start, lt: end }, returnLocationId: locationId },
        select: timelineSelect,
      }),
      db.booking.count({ where: { status: "ACTIVE", pickupLocationId: locationId } }),
      db.car.count({
        where: {
          opStatus: "ACTIVE",
          homeLocationId: locationId,
          bookings: {
            none: { blockedFrom: { lte: now }, blockedUntil: { gt: now }, ...blockingBooking(now) },
          },
        },
      }),
      db.car.count({
        where: { opStatus: { in: ["INSPECTION", "MAINTENANCE"] }, homeLocationId: locationId },
      }),
      db.booking.count({
        where: {
          pickupLocationId: locationId,
          OR: [
            { status: "CONFIRMED", paymentStatus: "UNPAID" },
            { status: "PENDING_PAYMENT", expiresAt: { gt: now } },
          ],
        },
      }),
      db.notification.count({ where: { status: "FAILED" } }),
      db.message.count({ where: { direction: "INBOUND", status: "NEW" } }),
      db.payment.count({ where: { kind: "REFUND", status: "PENDING" } }),
    ]);

  const timeline = [
    ...pickups.map((booking) => entry("pickup", booking)),
    ...returns.map((booking) => entry("return", booking)),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    today,
    counts: {
      pickups: pickups.length,
      returns: returns.length,
      active,
      available,
      inService,
    },
    attention: { unpaid, failedNotifications: failed, newMessages, pendingRefunds: refunds },
    timeline,
    kpi: can(ctx, "stats:read") ? await monthKpi(now, locationId) : null,
  };
}

/** Omsætning (betalt minus refunderet), nye kunder og udestående i indeværende måned. */
async function monthKpi(now: Date, locationId: string | undefined) {
  const today = localDateKey(now, ADMIN_TIME_ZONE);
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  const [year, month] = today.split("-").map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = localDayBounds(firstOfMonth, ADMIN_TIME_ZONE).start;
  const end = localDayBounds(addDaysToKey(firstOfMonth, daysInMonth), ADMIN_TIME_ZONE).start;
  const booking = locationId ? { pickupLocationId: locationId } : {};

  const [payments, newCustomers, outstanding] = await Promise.all([
    db.payment.groupBy({
      by: ["kind"],
      where: {
        status: "SUCCEEDED",
        kind: { in: ["CHARGE", "MANUAL", "REFUND"] },
        createdAt: { gte: start, lt: end },
        booking,
      },
      _sum: { amountMinor: true },
    }),
    db.customer.count({ where: { createdAt: { gte: start, lt: end } } }),
    db.booking.aggregate({
      where: { ...booking, status: { in: ["CONFIRMED", "ACTIVE"] }, paymentStatus: "UNPAID" },
      _sum: { totalMinor: true },
    }),
  ]);
  const sum = (kind: string) => payments.find((row) => row.kind === kind)?._sum.amountMinor ?? 0;
  return {
    revenueMinor: sum("CHARGE") + sum("MANUAL") - sum("REFUND"),
    newCustomers,
    outstandingMinor: outstanding._sum.totalMinor ?? 0,
    currency: "DKK",
  };
}
