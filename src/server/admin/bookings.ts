import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { BookingStatus } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { db } from "@/server/db";

export const ADMIN_PAGE_SIZE = 25;

/** Filtre på /admin/bookings. Ugyldige værdier ignoreres (som de offentlige søgninger). */
export const bookingFilterSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(BookingStatus).optional().catch(undefined),
  location: z.uuid().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
});

export type BookingFilter = z.infer<typeof bookingFilterSchema>;

/** Søgning på reference, kundens navn, e-mail eller telefon, eller bilens nummerplade. */
function searchWhere(q: string): Prisma.BookingWhereInput {
  const text = { contains: q, mode: "insensitive" as const };
  const words = q.split(/\s+/).filter(Boolean);
  return {
    OR: [
      { reference: { contains: q.toUpperCase() } },
      { customer: { email: text } },
      { customer: { phoneE164: { contains: q.replace(/[\s-]/g, "") } } },
      { car: { registrationNumber: text } },
      // "Mette Hansen": alle ord skal stå i for- eller efternavn.
      {
        AND: words.map((word) => ({
          customer: {
            OR: [
              { firstName: { contains: word, mode: "insensitive" as const } },
              { lastName: { contains: word, mode: "insensitive" as const } },
            ],
          },
        })),
      },
    ],
  };
}

export async function listBookings(ctx: PolicyContext, filter: BookingFilter) {
  assertCan(ctx, "booking:read");
  const page = filter.page ?? 1;
  const where: Prisma.BookingWhereInput = {
    // Udløbne reservationer er støj; de vises kun, når man filtrerer på dem.
    status: filter.status ?? { not: "EXPIRED" },
    ...(filter.location ? { pickupLocationId: filter.location } : {}),
    ...(filter.q ? searchWhere(filter.q) : {}),
  };
  const [rows, total] = await Promise.all([
    db.booking.findMany({
      where,
      orderBy: [{ pickupAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: {
        reference: true,
        status: true,
        paymentStatus: true,
        pickupAt: true,
        returnAt: true,
        totalMinor: true,
        currency: true,
        customer: { select: { firstName: true, lastName: true } },
        carModel: { select: { brand: true, model: true } },
        car: { select: { registrationNumber: true } },
        pickupLocation: { select: { name: true, timezone: true } },
      },
    }),
    db.booking.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
}

export type AdminBookingRow = Awaited<ReturnType<typeof listBookings>>["rows"][number];

/** Alt om én booking til admin: kunde, bil, linjer, betalinger, historik og beskeder. */
export async function adminBooking(ctx: PolicyContext, reference: string) {
  assertCan(ctx, "booking:read");
  const booking = await db.booking.findUnique({
    where: { reference: reference.toUpperCase() },
    include: {
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneE164: true,
          userId: true,
          preferredLocale: true,
          anonymizedAt: true,
        },
      },
      carModel: { select: { brand: true, model: true, slug: true } },
      car: { select: { id: true, registrationNumber: true, color: true } },
      pickupLocation: { select: { name: true, timezone: true, address: true, city: true } },
      returnLocation: { select: { name: true, timezone: true } },
      discount: { select: { code: true } },
      items: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "desc" } },
      statusEvents: {
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { name: true } } },
      },
      notifications: {
        orderBy: { scheduledAt: "desc" },
        select: {
          id: true,
          template: true,
          channel: true,
          status: true,
          scheduledAt: true,
          sentAt: true,
          attempts: true,
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        include: { assignedUser: { select: { name: true } } },
      },
    },
  });
  if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
  return booking;
}

export type AdminBooking = Awaited<ReturnType<typeof adminBooking>>;
