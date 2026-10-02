import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Bookingflowet mod seed-data (pnpm db:seed) med simuleret betaling (FAKE_PAYMENTS=true).
 * Hver test vælger en tilfældig tirsdag langt ude i fremtiden, så gentagne kørsler ikke
 * løber tør for ledige biler.
 */
function randomTuesday() {
  const date = new Date(Date.now() + (60 + Math.floor(Math.random() * 600)) * 86_400_000);
  while (date.getUTCDay() !== 2) date.setUTCDate(date.getUTCDate() + 1);
  const pickup = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 3);
  return { pickup, return: date.toISOString().slice(0, 10) };
}

function carUrl() {
  const dates = randomTuesday();
  return `/cars/volkswagen-golf?location=koebenhavn&pickupDate=${dates.pickup}&pickupTime=10:00&returnDate=${dates.return}&returnTime=10:00`;
}

test.beforeEach(async ({ page, context, baseURL }) => {
  const consent = { v: 1, at: new Date().toISOString(), analytics: false, marketing: false };
  await context.addCookies([
    { name: "consent", value: encodeURIComponent(JSON.stringify(consent)), url: baseURL! },
  ]);
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.18.${octet()}.${octet()}` });
});

async function expectNoSeriousA11yIssues(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
}

async function fillDetails(page: Page) {
  await page.getByLabel("Fornavn").fill("E2E");
  await page.getByLabel("Efternavn").fill("Testesen");
  await page.getByLabel("E-mail").fill("e2e-booking@example.com");
  await page.getByLabel("Mobilnummer").fill("12 34 56 78");
}

test("søg → ekstraudstyr → oplysninger → betal → bekræftelse", async ({ page }) => {
  await page.goto(carUrl());
  await page.getByRole("link", { name: "Book denne bil" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Tilpas din leje" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole("checkbox", { name: /GPS/ }).check();
  await page.getByRole("button", { name: "Opdatér pris" }).click();
  await expect(page).toHaveURL(/x_gps=1/);
  await page.getByRole("button", { name: "Fortsæt" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Dine oplysninger" })).toBeVisible();
  await fillDetails(page);
  // Uden accept af vilkår oprettes ingen booking.
  await page.getByRole("button", { name: "Gå til betaling" }).click();
  await expect(page.getByText("Du skal acceptere lejevilkårene for at booke.")).toBeVisible();
  await expect(page.getByLabel("Fornavn")).toHaveValue("E2E");
  await expectNoSeriousA11yIssues(page);
  await page.getByRole("checkbox", { name: /lejevilkårene/ }).check();
  await page.getByRole("button", { name: "Gå til betaling" }).click();

  await expect(page).toHaveURL(/\/booking\/pay\/BK-[A-Z0-9]{6}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Betaling" })).toBeVisible();
  await expect(page.getByText(/reserveret til dig til/)).toBeVisible();
  await expect(page.getByText("GPS", { exact: true })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  // Et afvist kort giver en tydelig fejl; reservationen holdes, og man kan prøve igen.
  await page.getByRole("button", { name: "Afprøv et afvist kort" }).click();
  await expect(page.getByText("Betalingen blev afvist.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: /^Betal / }).click();

  await expect(page).toHaveURL(/\/booking\/confirmation\/BK-/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Tak, E2E! Din booking er bekræftet" }),
  ).toBeVisible();
  const reference = page.url().split("/").pop()!;
  await expect(page.getByText(reference, { exact: true })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  // Betalingssiden sender en betalt booking videre til bekræftelsen.
  await page.goto(`/booking/pay/${reference}`);
  await expect(page).toHaveURL(/\/booking\/confirmation\//);
});

test("andre kan ikke se betalings- eller bekræftelsessiden", async ({ page, browser, baseURL }) => {
  await page.goto(carUrl());
  await page.getByRole("link", { name: "Book denne bil" }).click();
  await page.getByRole("button", { name: "Fortsæt" }).click();
  await fillDetails(page);
  await page.getByRole("checkbox", { name: /lejevilkårene/ }).check();
  await page.getByRole("button", { name: "Gå til betaling" }).click();
  await expect(page).toHaveURL(/\/booking\/pay\/BK-/);
  const reference = page.url().split("/").pop()!;

  const stranger = await browser.newContext({ baseURL });
  const other = await stranger.newPage();
  for (const path of [`/booking/pay/${reference}`, `/booking/confirmation/${reference}`]) {
    const response = await other.goto(path);
    expect(response?.status()).toBe(404);
  }
  await stranger.close();
});

test("uden bil og periode vises en vej tilbage til søgningen", async ({ page }) => {
  await page.goto("/booking");
  await expect(page.getByRole("heading", { level: 1, name: "Vælg bil og periode" })).toBeVisible();
  await page.getByRole("link", { name: "Find en bil" }).click();
  await expect(page).toHaveURL(/\/cars/);
});
