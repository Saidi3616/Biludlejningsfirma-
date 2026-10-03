"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Henter siden igen med jævne mellemrum, fx mens betalingen bekræftes af webhooken. */
export function AutoRefresh({ intervalMs = 2000, maxTimes = 30 }) {
  const router = useRouter();
  useEffect(() => {
    let count = 0;
    const timer = window.setInterval(() => {
      count += 1;
      if (count > maxTimes) window.clearInterval(timer);
      else router.refresh();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [router, intervalMs, maxTimes]);
  return null;
}
