import { expect, test } from "@playwright/test";

/** Strukturerede data på siden som objekter. */
async function structuredData(page: import("@playwright/test").Page) {
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  return scripts.map((text) => JSON.parse(text) as Record<string, unknown>);
}

test("sitemap har alle sprog med hreflang, og robots holder testmiljøet ude", async ({
  request,
}) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("<loc>http://localhost:3100/en/cars/volkswagen-golf</loc>");
  expect(sitemap).toContain('hreflang="ar" href="http://localhost:3100/ar/locations/koebenhavn"');
  expect(sitemap).not.toContain("/account");
  expect(sitemap).not.toContain("/admin");

  // Kun production må indekseres.
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /");
});

test("bil-siden har canonical, hreflang og Product-data", async ({ page }) => {
  await page.goto("/en/cars/volkswagen-golf");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "http://localhost:3100/en/cars/volkswagen-golf",
  );
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
    "href",
    "http://localhost:3100/cars/volkswagen-golf",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
  const [car] = await structuredData(page);
  expect(car).toMatchObject({
    "@type": ["Product", "Car"],
    brand: { name: "Volkswagen" },
    offers: { priceCurrency: "DKK" },
  });
});

test("lokation og FAQ har strukturerede data, private sider har noindex", async ({ page }) => {
  await page.goto("/locations/koebenhavn");
  expect((await structuredData(page))[0]).toMatchObject({
    "@type": "AutoRental",
    address: { addressCountry: "DK" },
  });
  await page.goto("/faq");
  expect((await structuredData(page))[0]).toMatchObject({ "@type": "FAQPage" });
  await page.goto("/login");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("appen kan installeres og viser offline-siden uden net", async ({ page, context }) => {
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/" });
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await page.request.get(icon.src)).ok()).toBe(true);
  }

  await page.goto("/en");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  try {
    await page.goto("/en/cars");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("You are offline");
  } finally {
    await context.setOffline(false);
  }
});
