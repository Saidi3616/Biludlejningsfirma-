import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Pagination } from "@/components/features/admin/pagination";
import { formatDate } from "@/lib/format";
import { customerFilterSchema, listCustomers } from "@/server/admin/customers";
import { ADMIN_TIME_ZONE } from "@/server/admin/dashboard";
import { getPolicyContext, requirePermission } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.customers" });
  return { title: t("title") };
}

export default async function AdminCustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  setRequestLocale("da");
  await requirePermission("customer:read");
  const filter = customerFilterSchema.parse(await searchParams);
  const [t, ctx] = await Promise.all([getTranslations("admin.customers"), getPolicyContext()]);
  const { rows, total, page, pages } = await listCustomers(ctx, filter);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>
      <form action="/admin/customers" className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-64 flex-1 flex-col gap-1.5 text-sm font-medium text-ink-900">
          {t("search")}
          <Input
            name="q"
            type="search"
            defaultValue={filter.q ?? ""}
            placeholder={t("searchHint")}
          />
        </label>
        <Button type="submit">
          <Search aria-hidden />
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
              <TH>{t("columns.name")}</TH>
              <TH>{t("columns.contact")}</TH>
              <TH>{t("columns.bookings")}</TH>
              <TH>{t("columns.account")}</TH>
              <TH>{t("columns.created")}</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD>
                  <Link
                    href={`/admin/customers/${row.id}`}
                    className="font-medium text-brand-700 underline"
                  >
                    {row.anonymizedAt ? t("anonymized") : `${row.firstName} ${row.lastName}`}
                  </Link>
                </TD>
                <TD>
                  <span className="flex flex-col">
                    <span className="break-all">{row.email}</span>
                    {row.phoneE164 ? (
                      <span className="text-sm text-muted">{row.phoneE164}</span>
                    ) : null}
                  </span>
                </TD>
                <TD>{row._count.bookings}</TD>
                <TD>{row.userId ? t("hasAccount") : t("guest")}</TD>
                <TD className="whitespace-nowrap">
                  {formatDate(row.createdAt, "da", ADMIN_TIME_ZONE)}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination
        page={page}
        pages={pages}
        path="/admin/customers"
        params={{ q: filter.q }}
        labels={{ previous: t("previous"), next: t("next"), status: t("page", { page, pages }) }}
      />
    </>
  );
}
