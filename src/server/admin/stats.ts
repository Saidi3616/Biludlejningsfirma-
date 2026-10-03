import "server-only";
import { Prisma, type BookingStatus } from "@/generated/prisma/client";
import { addDaysToKey, localDayBounds } from "@/lib/dates";
import { parseInput } from "@/lib/validation/parse";
import { statsQuerySchema } from "@/lib/validation/stats";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { db } from "@/server/db";
import { ADMIN_TIME_ZONE } from "./dashboard";

/** Bookinger, der er blevet til noget (betalt eller bekræftet); udløbne kurve tæller ikke. */
const BOOKED: BookingStatus[] = ["CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED", "NO_SHOW"];
/** Bookinger, der giver omsætning og holder en bil. */
const KEPT: BookingStatus[] = ["CONFIRMED", "ACTIVE", "COMPLETED"];

const TOP = 5;

/**
 * Statistik for en periode (M14). Bookinger tælles efter oprettelsesdato; omsætning er betalt
 * minus refunderet i perioden (samme regel som dashboardet); belægning er udlejede biltimer i
 * perioden delt med bilernes timer. Alle beløb i DKK (MVP har kun DKK).
 */
export async function statistics(ctx: PolicyContext, input: Record<string, unknown>) {
  assertCan(ctx, "stats:read");
  const query = parseInput(statsQuerySchema, input);
  const start = localDayBounds(query.from, ADMIN_TIME_ZONE).start;
  const end = localDayBounds(addDaysToKey(query.to, 1), ADMIN_TIME_ZONE).start;
  const location = query.location;
  const atLocation = location ? { pickupLocationId: location } : {};
  const created = { createdAt: { gte: start, lt: end } };

  const [payments, statuses, kept, byModel, periodCustomers, rentedHours, cars] = await Promise.all(
    [
      db.payment.groupBy({
        by: ["kind"],
        where: {
          status: "SUCCEEDED",
          kind: { in: ["CHARGE", "MANUAL", "REFUND"] },
          ...created,
          booking: atLocation,
        },
        _sum: { amountMinor: true },
      }),
      db.booking.groupBy({
        by: ["status"],
        where: { ...atLocation, ...created, status: { in: BOOKED } },
        _count: true,
      }),
      db.booking.aggregate({
        where: { ...atLocation, ...created, status: { in: KEPT } },
        _avg: { totalMinor: true },
      }),
      db.booking.groupBy({
        by: ["carModelId"],
        where: { ...atLocation, ...created, status: { in: KEPT } },
        _count: true,
        _sum: { totalMinor: true },
      }),
      db.booking.findMany({
        where: { ...atLocation, ...created, status: { in: KEPT } },
        distinct: ["customerId"],
        select: { customerId: true },
      }),
      db.$queryRaw<{ hours: number | null }[]>`
        SELECT SUM(EXTRACT(EPOCH FROM LEAST("returnAt", ${end}) - GREATEST("pickupAt", ${start}))) / 3600
          AS hours
        FROM "Booking"
        WHERE status IN ('CONFIRMED', 'ACTIVE', 'COMPLETED')
          AND "pickupAt" < ${end} AND "returnAt" > ${start}
          ${location ? Prisma.sql`AND "pickupLocationId" = ${location}::uuid` : Prisma.empty}`,
      db.car.count({
        where: {
          opStatus: { not: "RETIRED" },
          createdAt: { lt: end },
          ...(location ? { homeLocationId: location } : {}),
        },
      }),
    ],
  );

  // Gentagne kunder: kunder i perioden, der også har en tidligere booking.
  const customerIds = periodCustomers.map((row) => row.customerId);
  const returning = customerIds.length
    ? await db.booking.findMany({
        where: { customerId: { in: customerIds }, status: { in: KEPT }, createdAt: { lt: start } },
        distinct: ["customerId"],
        select: { customerId: true },
      })
    : [];

  const models = await db.carModel.findMany({
    where: { id: { in: byModel.map((row) => row.carModelId) } },
    select: {
      id: true,
      brand: true,
      model: true,
      category: { select: { id: true, nameI18n: true } },
    },
  });
  const modelById = new Map(models.map((model) => [model.id, model]));
  const popularModels = byModel
    .map((row) => {
      const model = modelById.get(row.carModelId)!;
      return {
        id: row.carModelId,
        name: `${model.brand} ${model.model}`,
        bookings: row._count,
        valueMinor: row._sum.totalMinor ?? 0,
      };
    })
    .sort((a, b) => b.bookings - a.bookings || b.valueMinor - a.valueMinor);

  const categories = new Map<
    string,
    { id: string; name: string; bookings: number; valueMinor: number }
  >();
  for (const row of byModel) {
    const category = modelById.get(row.carModelId)!.category;
    const names = category.nameI18n as Record<string, string>;
    const current = categories.get(category.id) ?? {
      id: category.id,
      name: names.da ?? Object.values(names)[0] ?? "",
      bookings: 0,
      valueMinor: 0,
    };
    current.bookings += row._count;
    current.valueMinor += row._sum.totalMinor ?? 0;
    categories.set(category.id, current);
  }

  const count = (status: BookingStatus) =>
    statuses.find((row) => row.status === status)?._count ?? 0;
  const bookings = statuses.reduce((sum, row) => sum + row._count, 0);
  const sum = (kind: string) => payments.find((row) => row.kind === kind)?._sum.amountMinor ?? 0;
  const capacityHours = (cars * (end.getTime() - start.getTime())) / 3_600_000;
  const rented = Number(rentedHours[0]?.hours ?? 0);

  return {
    query,
    currency: "DKK",
    revenueMinor: sum("CHARGE") + sum("MANUAL") - sum("REFUND"),
    refundsMinor: sum("REFUND"),
    bookings,
    cancelled: count("CANCELLED"),
    noShows: count("NO_SHOW"),
    /** Andel af bookingerne i perioden, der blev annulleret (0–1). */
    cancellationRate: bookings ? count("CANCELLED") / bookings : 0,
    averageValueMinor: Math.round(kept._avg.totalMinor ?? 0),
    /** Udlejede biltimer / bilernes timer i perioden (0–1). */
    occupancy: capacityHours ? Math.min(1, rented / capacityHours) : 0,
    cars,
    customers: customerIds.length,
    repeatCustomers: returning.length,
    popularModels: popularModels.slice(0, TOP),
    popularCategories: [...categories.values()]
      .sort((a, b) => b.bookings - a.bookings || b.valueMinor - a.valueMinor)
      .slice(0, TOP),
  };
}

export type Statistics = Awaited<ReturnType<typeof statistics>>;
