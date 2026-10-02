import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getPolicyContext } from "@/server/auth/session";
import { staffContractPdf } from "@/server/contracts/service";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * Kontrakten som PDF til personalet: underskrevet, eller en forhåndsvisning før underskrift.
 * Adgangen tjekkes ved hver forespørgsel, og svaret caches ikke.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/admin/bookings/[reference]/contract/pdf">,
) {
  const reference = (await params).reference.toUpperCase();
  try {
    if (!/^[A-Z0-9-]{1,40}$/.test(reference)) throw new AppError("NOT_FOUND", "Ukendt booking");
    const booking = await db.booking.findUnique({ where: { reference }, select: { id: true } });
    if (!booking) throw new AppError("NOT_FOUND", "Ukendt booking");
    const pdf = await staffContractPdf(await getPolicyContext(), booking.id);
    const name = pdf.signed ? `kontrakt-${pdf.reference}` : `kontrakt-${pdf.reference}-udkast`;
    return new Response(Buffer.from(pdf.body), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${name}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    // Manglende adgang og ukendte bookinger ser ens ud udefra.
    if (error instanceof AppError && error.code !== "SERVICE_UNAVAILABLE") {
      return new Response(null, { status: 404 });
    }
    logger.error({ err: error }, "contract pdf failed");
    return new Response(null, { status: 503 });
  }
}
