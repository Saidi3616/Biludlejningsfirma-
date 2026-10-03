import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { logCookieConsent } from "@/server/gdpr/consent";
import { assertRateLimit, clientIp } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** Cookie-banneret logger besøgendes valg (samtykkelog, M15). */
export async function POST(request: Request) {
  try {
    await assertRateLimit("consent", clientIp(request.headers), { max: 20, windowMs: 60_000 });
    const body = await request.json().catch(() => null);
    await logCookieConsent(body);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json(toErrorBody(error), { status: error.status });
    }
    logger.error({ err: error }, "consent log failed");
    const failure = new AppError("INTERNAL", "Noget gik galt");
    return Response.json(toErrorBody(failure), { status: failure.status });
  }
}
