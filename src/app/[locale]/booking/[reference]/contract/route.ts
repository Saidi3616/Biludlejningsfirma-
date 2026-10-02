import { logger } from "@/lib/logger";
import { findAccessibleBooking } from "@/server/booking/access";
import { signedContractDocument } from "@/server/contracts/service";
import { storage } from "@/server/storage";

export const dynamic = "force-dynamic";

/**
 * Kundens underskrevne lejekontrakt (05-user-flows: kontrakt som PDF). Kun for ejeren via login
 * eller "administrér booking"-cookien; alle andre får 404, så referencer ikke kan afprøves.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/[locale]/booking/[reference]/contract">,
) {
  const { reference } = await params;
  try {
    const bookingId = await findAccessibleBooking(reference);
    if (!bookingId) return new Response(null, { status: 404 });
    const document = await signedContractDocument(bookingId);
    if (!document) return new Response(null, { status: 404 });
    const object = await storage().get(document.storageKey);
    if (!object) return new Response(null, { status: 404 });
    return new Response(Buffer.from(object.body), {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `inline; filename="kontrakt-${reference}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "customer contract fetch failed");
    return new Response(null, { status: 503 });
  }
}
