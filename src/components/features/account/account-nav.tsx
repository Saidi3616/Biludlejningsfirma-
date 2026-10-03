"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

const items = [
  {
    href: "/account",
    key: "bookings",
    match: (path: string) => path === "/account" || path.startsWith("/account/bookings"),
  },
  {
    href: "/account/payments",
    key: "payments",
    match: (path: string) => path.startsWith("/account/payments"),
  },
  {
    href: "/account/documents",
    key: "documents",
    match: (path: string) => path.startsWith("/account/documents"),
  },
  {
    href: "/account/profile",
    key: "profile",
    match: (path: string) => path.startsWith("/account/profile"),
  },
  {
    href: "/account/privacy",
    key: "privacy",
    match: (path: string) => path.startsWith("/account/privacy"),
  },
] as const;

/** Faner i Min konto. Almindelige links, så de virker uden JavaScript. */
export function AccountNav() {
  const t = useTranslations("account.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="print:hidden">
      <ul className="flex gap-1 overflow-x-auto border-b border-border">
        {items.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex border-b-2 px-4 py-2.5 text-base font-medium whitespace-nowrap",
                  active
                    ? "border-brand-700 text-ink-900"
                    : "border-transparent text-ink-600 hover:text-ink-900",
                )}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
