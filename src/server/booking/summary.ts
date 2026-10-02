import "server-only";
import { isReceived, isRefund } from "@/lib/payments";
import { db } from "@/server/db";

/** Det, kunden ser om sin booking (betaling, bekræftelse, administrér, kvittering). Ingen interne felter. */
export async function bookingSummary(bookingId: string) {
  const booking = await db.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: {
      customer: { select: { firstName: true, lastName: true, email: true } },
      carModel: { select: { brand: true, model: true, slug: true } },
      pickupLocation: {
        select: { name: true, slug: true, timezone: true, address: true, city: true },
      },
      returnLocation: { select: { name: true, slug: true, timezone: true } },
      items: { orderBy: { createdAt: "asc" } },
      payments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          kind: true,
          status: true,
          failureCode: true,
          method: true,
          cardBrand: true,
          cardLast4: true,
          amountMinor: true,
          currency: true,
          createdAt: true,
        },
      },
      statusEvents: { where: { toStatus: "CONFIRMED" }, select: { id: true }, take: 1 },
      contract: { select: { signedAt: true } },
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
    lastPayment: booking.payments.find((payment) => payment.kind === "CHARGE") ?? null,
    /** Gennemførte betalinger og refusioner (også dem, der er sat i gang), nyeste først. */
    payments: booking.payments.filter((payment) => isReceived(payment) || isRefund(payment)),
    /** Bookingen har været bekræftet (fx en annulleret booking, der var betalt). */
    wasConfirmed: booking.statusEvents.length > 0,
    /** Lejekontrakten er underskrevet ved udleveringen og kan hentes som PDF. */
    contractSigned: Boolean(booking.contract?.signedAt),
    createdAt: booking.createdAt,
    subtotalMinor: booking.subtotalMinor,
  };
}

export type BookingSummary = Awaited<ReturnType<typeof bookingSummary>>;
