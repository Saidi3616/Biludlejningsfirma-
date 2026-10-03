import { logger } from "@/lib/logger";
import { storage } from "@/server/storage";
import { assertStorageKey } from "@/server/storage/types";

export const dynamic = "force-dynamic";

/**
 * Offentlige bilbilleder (`public/…` i storage). Nøglerne er unikke og ændres aldrig, så
 * svaret kan caches for altid. Private filer kan ikke hentes her.
 */
export async function GET(_request: Request, { params }: RouteContext<"/media/[...key]">) {
  const { key: parts } = await params;
  const key = `public/${parts.join("/")}`;
  try {
    assertStorageKey(key);
  } catch {
    return new Response(null, { status: 404 });
  }
  try {
    const object = await storage().get(key);
    if (!object) return new Response(null, { status: 404 });
    return new Response(Buffer.from(object.body), {
      headers: {
        "Content-Type": object.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "media fetch failed");
    return new Response(null, { status: 503 });
  }
}
