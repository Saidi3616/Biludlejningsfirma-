import { expect, test } from "@playwright/test";

test("cookie-banner: valg gemmes og kan ændres igen", async ({ page, context }) => {
  await page.goto("/");
  const banner = page.getByRole("dialog", { name: "Vi bruger cookies" });
  await expect(banner).toBeVisible();
  // Banneret ligger i server-HTML'en; knapperne virker, når siden er hydreret.
  await expect(banner).not.toHaveAttribute("data-consent-pending");

  await banner.getByRole("button", { name: "Kun nødvendige" }).click();
  await expect(banner).toBeHidden();

  const consent = (await context.cookies()).find((c) => c.name === "consent");
  expect(JSON.parse(decodeURIComponent(consent!.value))).toMatchObject({
    v: 1,
    analytics: false,
    marketing: false,
  });

  await page.reload();
  await expect(banner).toBeHidden();

  await page.getByRole("button", { name: "Cookieindstillinger" }).click();
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("switch", { name: "Statistik" })).not.toBeChecked();
  await banner.getByRole("switch", { name: "Statistik" }).click();
  await banner.getByRole("button", { name: "Gem valg" }).click();

  const updated = (await context.cookies()).find((c) => c.name === "consent");
  expect(JSON.parse(decodeURIComponent(updated!.value))).toMatchObject({
    analytics: true,
    marketing: false,
  });
});

test("cookie-banner blinker ikke for besøgende, der allerede har valgt", async ({
  page,
  context,
  baseURL,
}) => {
  const consent = { v: 1, at: new Date().toISOString(), analytics: false, marketing: false };
  await context.addCookies([
    { name: "consent", value: encodeURIComponent(JSON.stringify(consent)), url: baseURL! },
  ]);
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.locator("html")).toHaveClass(/has-consent/);
  await expect(page.getByRole("dialog", { name: "Vi bruger cookies" })).toBeHidden();
});
