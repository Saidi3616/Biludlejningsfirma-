import { expect, test, type Page } from "@playwright/test";
import { carUrl } from "./booking-helpers";

// Bredder fra kravspecifikationen §38.
const widths = [320, 375, 390, 430, 768, 1024, 1440, 1920];
const pages = [
  "/",
  "/ar",
  "/styleguide",
  "/ar/styleguide",
  // M17: siderne i kundens vej til en booking.
  "/cars",
  "/cars/volkswagen-golf",
  "/ar/cars/volkswagen-golf",
  "/pricing",
  "/contact",
  "/login",
];

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("ingen vandret scroll", () => {
  test.skip(({ isMobile }) => isMobile, "Bredderne sættes manuelt; køres én gang.");

  for (const path of pages) {
    for (const width of widths) {
      test(`${path} ved ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      });
    }
  }
});

test("WhatsApp: flydende knap på mobil, i navigationen på desktop", async ({ page, isMobile }) => {
  await page.goto("/");
  const floating = page.getByRole("link", { name: "Skriv til os på WhatsApp" });
  const inNav = page.getByRole("banner").getByRole("link", { name: "WhatsApp" });
  const [shown, hidden] = isMobile ? [floating, inNav] : [inNav, floating];
  await expect(shown).toBeVisible();
  await expect(hidden).toBeHidden();
  await expect(shown).toHaveAttribute("href", /^https:\/\/wa\.me\/\d+\?text=/);
});

test("mobilmenuen åbner og viser hovedmenuen", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Kun på mobil");
  await page.goto("/");
  await page.getByRole("button", { name: "Åbn menu" }).click();
  const dialog = page.getByRole("dialog", { name: "Menu" });
  await expect(dialog.getByRole("link", { name: "Biler" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("bookingflowet kan gennemføres ved 320px uden vandret scroll", async ({
  page,
  context,
  baseURL,
}) => {
  const consent = { v: 1, at: new Date().toISOString(), analytics: false, marketing: false };
  await context.addCookies([
    { name: "consent", value: encodeURIComponent(JSON.stringify(consent)), url: baseURL! },
  ]);
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.19.${octet()}.${octet()}` });
  await page.setViewportSize({ width: 320, height: 640 });

  // En model, som de andre E2E-tests ikke booker, så perioden sjældent er optaget.
  await page.goto(carUrl("toyota-aygo-x"));
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await page.getByRole("link", { name: "Book denne bil" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tilpas din leje" })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Fortsæt" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Dine oplysninger" })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await page.getByLabel("Fornavn").fill("Smal");
  await page.getByLabel("Efternavn").fill("Skærm");
  await page.getByLabel("E-mail").fill("e2e-smal@example.com");
  await page.getByLabel("Mobilnummer").fill("12 34 56 78");
  await page.getByRole("checkbox", { name: /lejevilkårene/ }).check();
  await page.getByRole("button", { name: "Gå til betaling" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Betaling" })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: /^Betal / }).click();
  await expect(page).toHaveURL(/\/booking\/confirmation\/BK-/);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
