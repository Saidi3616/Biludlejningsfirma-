"use client";

import { useEffect } from "react";

/** Registrerer service workeren (public/sw.js) i produktion: installérbar app og offline-side. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Uden service worker virker siden som almindelig hjemmeside.
    });
  }, []);
  return null;
}
