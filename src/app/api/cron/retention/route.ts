import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { isAuthorizedCron } from "@/server/cron/auth";
import { runRetention } from "@/server/gdpr/retention";

export const dynamic = "force-dynamic";

/** Dagligt: slet dokumenter efter retention-fristen og ryd udløbne sessioner (GDPR). */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    const error = new AppError("UNAUTHENTICATED", "Ugyldig cron-nøgle");
    return Response.json(toErrorBody(error), { status: error.status });
  }
  const result = await runRetention();
  logger.info(result, "retention done");
  return Response.json(result);
}
