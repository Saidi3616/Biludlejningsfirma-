import "server-only";
import { z } from "zod";
import { addDaysToKey, localDateKey, localDayBounds } from "@/lib/dates";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { db } from "@/server/db";
import { ADMIN_TIME_ZONE } from "./dashboard";

export const calendarFilterSchema = z.object({
  start: z.iso.date().optional().catch(undefined),
  days: z.coerce
    .number()
    .pipe(z.union([z.literal(7), z.literal(14)]))
    .optional()
    .catch(undefined),
  location: z.uuid().optional().catch(undefined),
});

export type CalendarFilter = z.infer<typeof calendarFilterSchema>;

/**
 * Tidslinje pr. bil (06-admin-flows.md, F7): rækker = biler, blokke = bookinger og service.
 * Annullerede og udløbne bookinger vises ikke; de holder ikke bilen.
 */
export async function adminCalendar(ctx: PolicyContext, filter: CalendarFilter, now = new Date()) {
  assertCan(ctx, "booking:read");
  const startKey = filter.start ?? localDateKey(now, ADMIN_TIME_ZONE);
  const days = filter.days ?? 7;
  const from = localDayBounds(startKey, ADMIN_TIME_ZONE).start;
  const until = localDayBounds(addDaysToKey(startKey, days), ADMIN_TIME_ZONE).start;
  const overlaps = { blockedFrom: { lt: until }, blockedUntil: { gt: from } };

  const [locations, cars] = await Promise.all([
    db.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.car.findMany({
      where: {
        opStatus: { not: "RETIRED" },
        ...(filter.location ? { homeLocationId: filter.location } : {}),
      },
      orderBy: [
        { carModel: { brand: "asc" } },
        { carModel: { model: "asc" } },
        { registrationNumber: "asc" },
      ],
      select: {
        id: true,
        registrationNumber: true,
        opStatus: true,
        carModel: { select: { brand: true, model: true } },
        homeLocation: { select: { name: true } },
        bookings: {
          where: {
            ...overlaps,
            OR: [
              { status: { in: ["CONFIRMED", "ACTIVE", "COMPLETED", "NO_SHOW"] } },
              { status: "PENDING_PAYMENT", expiresAt: { gt: now } },
            ],
          },
          orderBy: { pickupAt: "asc" },
          select: {
            reference: true,
            status: true,
            pickupAt: true,
            returnAt: true,
            customer: { select: { firstName: true, lastName: true } },
          },
        },
        maintenance: {
          where: {
            status: { in: ["PLANNED", "IN_PROGRESS"] },
            startsAt: { lt: until },
            endsAt: { gt: from },
          },
          select: { id: true, type: true, startsAt: true, endsAt: true },
        },
      },
    }),
  ]);

  return {
    startKey,
    days,
    from,
    until,
    dayKeys: Array.from({ length: days }, (_, index) => addDaysToKey(startKey, index)),
    previousStart: addDaysToKey(startKey, -days),
    nextStart: addDaysToKey(startKey, days),
    locations,
    cars,
  };
}

export type AdminCalendar = Awaited<ReturnType<typeof adminCalendar>>;
