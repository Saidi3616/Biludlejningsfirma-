import { AppError, toErrorBody } from "@/lib/errors";
import { getCurrentUser } from "@/server/auth/session";
import { exportOwnData } from "@/server/gdpr/service";

export const dynamic = "force-dynamic";

/** Kundens egne data som JSON-fil (artikel 15 og 20). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "CUSTOMER") {
    const error = new AppError("UNAUTHENTICATED", "Log ind først");
    return Response.json(toErrorBody(error), { status: error.status });
  }
  try {
    const data = await exportOwnData(user.userId);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="mine-data.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json(toErrorBody(error), { status: error.status });
    }
    throw error;
  }
}
