import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Pagination } from "@/components/features/admin/pagination";
import { formatDateTime } from "@/lib/format";
import { auditFilterSchema, listAuditLog } from "@/server/admin/audit-log";
import { ADMIN_TIME_ZONE } from "@/server/admin/dashboard";
import { getPolicyContext, requirePermission } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.auditLog" });
  return { title: t("title") };
}

/** Hvem gjorde hvad og hvornår (M15, MANAGER+). */
export default async function AuditLogPage({ searchParams }: PageProps<"/admin/audit-log">) {
  setRequestLocale("da");
  await requirePermission("audit:read");
  const filter = auditFilterSchema.parse(await searchParams);
  const [t, tAdmin, ctx] = await Promise.all([
    getTranslations("admin.auditLog"),
    getTranslations("admin"),
    getPolicyContext(),
  ]);
  const { rows, total, page, pages, entityTypes } = await listAuditLog(ctx, filter);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>
      <p className="text-muted">{t("intro")}</p>
      <form action="/admin/audit-log" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-900">
          {t("entity")}
          <Select name="entity" defaultValue={filter.entity ?? ""} className="min-w-44">
            <option value="">{t("allEntities")}</option>
            {entityTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-56 flex-col gap-1.5 text-sm font-medium text-ink-900">
          {t("action")}
          <Input name="action" defaultValue={filter.action ?? ""} placeholder={t("actionHint")} />
        </label>
        <Button type="submit" variant="secondary">
          {t("submit")}
        </Button>
      </form>
      <p className="text-sm text-muted" role="status">
        {t("count", { count: total })}
      </p>
      {rows.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <Table label={t("title")} className="bg-white">
          <THead>
            <TR>
              <TH>{t("columns.time")}</TH>
              <TH>{t("columns.who")}</TH>
              <TH>{t("columns.action")}</TH>
              <TH>{t("columns.entity")}</TH>
              <TH>{t("columns.details")}</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD className="whitespace-nowrap tabular-nums">
                  {formatDateTime(row.createdAt, "da", ADMIN_TIME_ZONE)}
                </TD>
                <TD>
                  {row.actor ? (
                    <span className="flex flex-col">
                      {row.actor.name}
                      <span className="text-sm text-muted">
                        {tAdmin(`roles.${row.actor.role}`)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted">{t("system")}</span>
                  )}
                </TD>
                <TD>
                  <code className="text-sm">{row.action}</code>
                </TD>
                <TD>
                  {row.href ? (
                    <Link href={row.href} className="text-brand-700 underline">
                      {row.entityType}
                    </Link>
                  ) : (
                    row.entityType
                  )}
                </TD>
                <TD>
                  {row.diff ? (
                    <details>
                      <summary className="cursor-pointer text-sm text-brand-700">
                        {t("show")}
                      </summary>
                      <pre className="mt-2 max-w-md overflow-x-auto rounded bg-ink-50 p-2 text-xs">
                        {JSON.stringify(row.diff, null, 2)}
                      </pre>
                    </details>
                  ) : (
                    <span className="text-muted">–</span>
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination
        page={page}
        pages={pages}
        path="/admin/audit-log"
        params={{ action: filter.action, entity: filter.entity }}
        labels={{ previous: t("previous"), next: t("next"), status: t("page", { page, pages }) }}
      />
    </>
  );
}
