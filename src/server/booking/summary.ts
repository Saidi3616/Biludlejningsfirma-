import "server-only";
import { db } from "@/server/db";

/** Det, kunden ser om sin booking på betalings- og bekræftelsessiden. Ingen interne felter. */
export async function bookingSummary(bookingId: string) {
  const booking = await db.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: {
      customer: { select: { firstName: true, email: true } },
      carModel: { select: { brand: true, model: true, slug: true } },
      pickupLocation: {
        select: { name: true, slug: true, timezone: true, address: true, city: true },
      },
      returnLocation: { select: { name: true, slug: true, timezone: true } },
      items: { orderBy: { createdAt: "asc" } },
      payments: {
        where: { kind: "CHARGE" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, failureCode: true, method: true, cardBrand: true, cardLast4: true },
      },
    },
  });

  return {
    id: booking.id,
    reference: booking.reference,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    expiresAt: booking.expiresAt,
    pickupAt: booking.pickupAt,
    returnAt: booking.returnAt,
    fulfilment: booking.fulfilment,
    deliveryAddress: booking.deliveryAddress,
    totalMinor: booking.totalMinor,
    discountMinor: booking.discountMinor,
    depositMinor: booking.depositMinor,
    currency: booking.currency,
    customer: booking.customer,
    car: {
      name: `${booking.carModel.brand} ${booking.carModel.model}`,
      slug: booking.carModel.slug,
    },
    pickupLocation: booking.pickupLocation,
    returnLocation: booking.returnLocation,
    items: booking.items.map((item) => ({
      type: item.type,
      label: item.labelSnapshot,
      quantity: item.quantity,
      totalMinor: item.totalMinor,
    })),
    lastPayment: booking.payments[0] ?? null,
  };
}

export type BookingSummary = Awaited<ReturnType<typeof bookingSummary>>;
