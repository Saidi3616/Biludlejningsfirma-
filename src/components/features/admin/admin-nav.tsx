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
  items: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  return (
    <nav aria-label={label} className="-mx-2 overflow-x-auto">
      <ul className="flex gap-1 px-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active(item.href) ? "page" : undefined}
              className={cn(
                "inline-flex rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap hover:bg-ink-50 hover:text-ink-900",
                active(item.href) ? "bg-ink-100 text-ink-900" : "text-ink-700",
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
