import "server-only";
import type { BookingStatus } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { profileSchema } from "@/lib/validation/account";
import { db } from "@/server/db";

/** Statusser, hvor bookingen stadig ligger foran kunden. */
const UPCOMING: BookingStatus[] = ["PENDING_PAYMENT", "CONFIRMED", "ACTIVE"];

/**
 * Gæstebookinger med samme e-mail flyttes til kontoen (K7). Kun for en verificeret e-mail: login
 * kræver verificering, så en indlogget bruger ejer sin e-mail. Kaldes, når kunden åbner /account.
 */
export async function claimGuestBookings(user: { userId: string; email: string; name: string }) {
  const email = user.email.toLowerCase();
  const guests = await db.customer.findMany({
    where: { email, userId: null, anonymizedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, firstName: true, lastName: true, phoneE164: true, preferredLocale: true },
  });
  if (guests.length === 0) return 0;
  const guestIds = guests.map((guest) => guest.id);
  const newest = guests[0]!;

  const moved = await db.$transaction(async (tx) => {
    const own =
      (await tx.customer.findUnique({ where: { userId: user.userId }, select: { id: true } })) ??
      (await tx.customer.create({
        data: {
          userId: user.userId,
          email,
          firstName: newest.firstName,
          lastName: newest.lastName,
          phoneE164: newest.phoneE164,
          preferredLocale: newest.preferredLocale,
        },
        select: { id: true },
      }));
    const where = { customerId: { in: guestIds } };
    const data = { customerId: own.id };
    const bookings = await tx.booking.updateMany({ where, data });
    await tx.notification.updateMany({ where, data });
    await tx.discountRedemption.updateMany({ where, data });
    await tx.consent.updateMany({ where, data });
    await tx.review.updateMany({ where, data });
    await tx.message.updateMany({ where, data });
    await tx.customer.deleteMany({ where: { id: { in: guestIds } } });
    return bookings.count;
  });
  logger.info({ userId: user.userId, bookings: moved }, "guest bookings linked to account");
  return moved;
}

/** Kundens bookinger: kommende øverst (nærmeste først), derefter tidligere. Udløbne vises ikke. */
export async function customerBookings(userId: string, now = new Date()) {
  const bookings = await db.booking.findMany({
    where: { customer: { userId }, status: { not: "EXPIRED" } },
    orderBy: { pickupAt: "asc" },
    select: {
      reference: true,
      status: true,
      paymentStatus: true,
      pickupAt: true,
      returnAt: true,
      totalMinor: true,
      currency: true,
      carModel: { select: { brand: true, model: true } },
      pickupLocation: { select: { name: true, timezone: true } },
    },
  });
  const rows = bookings.map((booking) => ({
    reference: booking.reference,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    pickupAt: booking.pickupAt,
    returnAt: booking.returnAt,
    totalMinor: booking.totalMinor,
    currency: booking.currency,
    carName: `${booking.carModel.brand} ${booking.carModel.model}`,
    location: booking.pickupLocation,
  }));
  const isUpcoming = (row: (typeof rows)[number]) =>
    UPCOMING.includes(row.status) && row.returnAt >= now;
  return {
    upcoming: rows.filter(isUpcoming),
    past: rows.filter((row) => !isUpcoming(row)).reverse(),
  };
}

export type AccountBooking = Awaited<ReturnType<typeof customerBookings>>["upcoming"][number];

/** Betalinger og refusioner på kundens bookinger, nyeste først. Ingen kortdata ud over brand og sidste 4. */
export async function customerPayments(userId: string) {
  const payments = await db.payment.findMany({
    where: {
      booking: { customer: { userId } },
      OR: [
        { kind: { in: ["CHARGE", "MANUAL"] }, status: "SUCCEEDED" },
        { kind: "REFUND", status: { in: ["PENDING", "SUCCEEDED"] } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      kind: true,
      status: true,
      method: true,
      cardBrand: true,
      cardLast4: true,
      amountMinor: true,
      currency: true,
      createdAt: true,
      booking: { select: { reference: true } },
    },
  });
  return payments.map(({ booking, ...payment }) => ({ ...payment, reference: booking.reference }));
}

export async function customerProfile(user: { userId: string; name: string; locale: string }) {
  const customer = await db.customer.findUnique({
    where: { userId: user.userId },
    select: { firstName: true, lastName: true, phoneE164: true },
  });
  const [firstName = "", ...rest] = user.name.split(" ");
  return {
    firstName: customer?.firstName ?? firstName,
    lastName: customer?.lastName ?? rest.join(" "),
    phone: customer?.phoneE164 ?? "",
    locale: user.locale,
  };
}

/** Opdaterer kundeposten og brugerens navn og sprog (bruges til e-mails). */
export async function updateProfile(
  user: { userId: string; email: string },
  input: Record<string, unknown>,
) {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "Ugyldige felter", {
      fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))],
    });
  }
  const { firstName, lastName, phone, locale } = parsed.data;
  const details = { firstName, lastName, phoneE164: phone, preferredLocale: locale };
  await db.$transaction([
    db.customer.upsert({
      where: { userId: user.userId },
      create: { ...details, userId: user.userId, email: user.email.toLowerCase() },
      update: details,
    }),
    db.user.update({
      where: { id: user.userId },
      data: { name: `${firstName} ${lastName}`, locale },
    }),
  ]);
}
