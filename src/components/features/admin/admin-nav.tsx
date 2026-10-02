"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** Adminmenuen. Det aktive punkt markeres med aria-current. */
export function AdminNav({
  label,
  items,
}: {
  label: string;
  /** `also`: andre stier, der hører under punktet (fx ekstraudstyr under priser). */
  items: { href: string; label: string; also?: string[] }[];
}) {
  const pathname = usePathname();
  const active = ({ href, also = [] }: { href: string; also?: string[] }) =>
    href === "/admin"
      ? pathname === "/admin"
      : [href, ...also].some((prefix) => pathname.startsWith(prefix));
  return (
    <nav aria-label={label} className="-mx-2 overflow-x-auto">
      <ul className="flex gap-1 px-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active(item) ? "page" : undefined}
              className={cn(
                "inline-flex rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap hover:bg-ink-50 hover:text-ink-900",
                active(item) ? "bg-ink-100 text-ink-900" : "text-ink-700",
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
