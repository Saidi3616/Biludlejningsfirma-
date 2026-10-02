import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getPolicyContext } from "@/server/auth/session";
import { privateDocument } from "@/server/inspections/service";
import { storage } from "@/server/storage";

export const dynamic = "force-dynamic";

/**
 * Private fotos (inspektioner, skader) til admin. Adgangen tjekkes ved hver forespørgsel;
 * svaret må kun caches i medarbejderens egen browser.
 */
export async function GET(_request: Request, { params }: RouteContext<"/admin/files/[id]">) {
  const { id } = await params;
  try {
    const document = await privateDocument(await getPolicyContext(), id);
    const object = await storage().get(document.storageKey);
    if (!object) return new Response(null, { status: 404 });
    return new Response(Buffer.from(object.body), {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    // Manglende adgang og ukendte filer ser ens ud udefra.
    if (error instanceof AppError && error.code !== "SERVICE_UNAVAILABLE") {
      return new Response(null, { status: 404 });
    }
    logger.error({ err: error }, "private file fetch failed");
    return new Response(null, { status: 503 });
  }
}
