import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/cn";

/** Underpunkter for det, kunden kan købe (F8): priser og ekstraudstyr. */
export async function CatalogTabs({ current }: { current: "pricing" | "extras" }) {
  const t = await getTranslations("admin.catalog");
  const tabs = [
    { key: "pricing", href: "/admin/pricing", label: t("tabs.pricing") },
    { key: "extras", href: "/admin/extras", label: t("tabs.extras") },
  ] as const;
  return (
    <nav aria-label={t("tabs.label")} className="flex gap-2 border-b border-border">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === current ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
            tab.key === current
              ? "border-brand-700 text-brand-700"
              : "border-transparent text-muted hover:text-ink-900",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
