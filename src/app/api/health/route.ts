import { db } from "@/server/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Bruges af uptime-monitorering og efter deploy. Afslører ingen detaljer om fejlen. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "ok" });
  } catch (error) {
    logger.error({ err: error }, "health check: database unreachable");
    return Response.json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }
}
