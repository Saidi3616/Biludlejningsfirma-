import { AppError } from "@/lib/errors";
import { getPolicyContext } from "@/server/auth/session";
import { exportCustomer } from "@/server/gdpr/service";

export const dynamic = "force-dynamic";

/** GDPR-eksport af en kunde som JSON-fil (F10, MANAGER+). Logges i audit-loggen. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/admin/customers/[id]/export">,
) {
  const { id } = await params;
  try {
    const data = await exportCustomer(await getPolicyContext(), id);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="kunde-${id}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    // Manglende adgang og ukendte kunder ser ens ud udefra.
    if (error instanceof AppError) return new Response(null, { status: 404 });
    throw error;
  }
}
