/* Service worker (M16). Håndskrevet og bevidst lille:
 * - sider hentes altid fra netværket (priser og ledighed skal være friske); uden net vises
 *   offline-siden på brugerens sprog
 * - Next.js' statiske filer har hash i navnet og må caches for evigt
 * - alt andet (API, admin, billeder, betaling) går direkte til netværket
 * Hæv VERSION, når logikken her ændres, så gamle caches ryddes.
 */
const VERSION = "v1";
const PAGES = `pages-${VERSION}`;
const STATIC = `static-${VERSION}`;
const MAX_STATIC_ENTRIES = 200;
const OFFLINE_PAGES = { da: "/offline", en: "/en/offline", ar: "/ar/offline", fr: "/fr/offline" };

async function precacheOffline() {
  const pages = await caches.open(PAGES);
  const assets = await caches.open(STATIC);
  await Promise.all(
    Object.values(OFFLINE_PAGES).map(async (path) => {
      try {
        const response = await fetch(path, { cache: "reload" });
        if (!response.ok) return;
        const html = await response.clone().text();
        await pages.put(path, response);
        // Offline-sidens stylesheet, så den også ser rigtig ud uden net.
        const styles = [...html.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)].map((m) => m[1]);
        await Promise.all(styles.map((href) => assets.add(href).catch(() => undefined)));
      } catch {
        // Uden net under installationen prøves der igen ved næste besøg.
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheOffline().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES, STATIC]);
      const names = await caches.keys();
      await Promise.all(names.filter((name) => !keep.has(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

function offlinePathFor(pathname) {
  const prefix = pathname.split("/")[1];
  return OFFLINE_PAGES[prefix] && prefix !== "da" ? OFFLINE_PAGES[prefix] : OFFLINE_PAGES.da;
}

async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(
    keys.slice(0, Math.max(0, keys.length - MAX_STATIC_ENTRIES)).map((key) => cache.delete(key)),
  );
}

async function staticAsset(request) {
  const cache = await caches.open(STATIC);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trim(cache);
  }
  return response;
}

async function page(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/admin")) throw error;
    const offline = await caches.match(offlinePathFor(url.pathname), { cacheName: PAGES });
    if (offline) return offline;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staticAsset(request));
  } else if (request.mode === "navigate") {
    event.respondWith(page(request));
  }
});
