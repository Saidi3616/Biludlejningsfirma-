import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { isAuthorizedCron } from "@/server/cron/auth";
import { sendDueNotifications } from "@/server/notifications/dispatch";

export const dynamic = "force-dynamic";

/** Hvert minut: send forfaldne e-mails og WhatsApp-beskeder fra udbakken (med genforsøg). */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    const error = new AppError("UNAUTHENTICATED", "Ugyldig cron-nøgle");
    return Response.json(toErrorBody(error), { status: error.status });
  }
  const result = await sendDueNotifications();
  if (result.sent + result.retry + result.failed > 0)
    logger.info(result, "notifications dispatched");
  return Response.json(result);
}
