import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { expireReservations } from "@/server/booking/expire";
import { isAuthorizedCron } from "@/server/cron/auth";

export const dynamic = "force-dynamic";

/** Hvert minut: ubetalte reservationer efter fristen → EXPIRED, så bilen frigives. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    const error = new AppError("UNAUTHENTICATED", "Ugyldig cron-nøgle");
    return Response.json(toErrorBody(error), { status: error.status });
  }
  const expired = await expireReservations();
  if (expired > 0) logger.info({ expired }, "reservations expired");
  return Response.json({ expired });
}
