import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Offentlige sider mod seed-data (pnpm db:seed). Datoerne ligger altid i fremtiden:
 * en tirsdag cirka en måned frem til fredag samme uge, så kontoret i København har åbent.
 */
function nextTuesday(daysAhead = 30) {
  const date = new Date(Date.now() + daysAhead * 86_400_000);
  while (date.getUTCDay() !== 2) date.setUTCDate(date.getUTCDate() + 1);
  const pickup = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 3);
  return { pickup, return: date.toISOString().slice(0, 10) };
}

test.beforeEach(async ({ page, context, baseURL }) => {
  // Samtykke er allerede givet, så banneret ikke dækker knapperne på mobil.
  const consent = { v: 1, at: new Date().toISOString(), analytics: false, marketing: false };
  await context.addCookies([
    { name: "consent", value: encodeURIComponent(JSON.stringify(consent)), url: baseURL! },
  ]);
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.${octet()}.${octet()}` });
});

test("søg på forsiden → ledige biler → bil-side med pris", async ({ page }) => {
  const dates = nextTuesday();
  await page.goto("/");
  await page.getByRole("combobox", { name: /^Afhentning/ }).selectOption("koebenhavn");
  await page.getByLabel("Afhentningsdato").fill(dates.pickup);
  await page.getByLabel("Afleveringsdato").fill(dates.return);
  await page.getByRole("button", { name: "Find biler" }).click();

  await expect(page).toHaveURL(/\/cars\?.*location=koebenhavn/);
  await expect(page.getByRole("heading", { level: 1, name: "Ledige biler" })).toBeVisible();
  await expect(page.getByText(/3 dage/).first()).toBeVisible();
  const first = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("article") })
    .first();
  await expect(first.getByText(/i alt/)).toBeVisible();

  await first.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/cars\/[a-z0-9-]+\?.*pickupDate=/);
  await expect(page.getByText("Ledig i perioden")).toBeVisible();
  await expect(page.getByRole("link", { name: "Book denne bil" })).toBeVisible();
  await expect(page.getByText("I alt", { exact: true })).toBeVisible();
});

test("filtre bevarer søgningen", async ({ page }) => {
  const dates = nextTuesday();
  await page.goto(
    `/cars?location=koebenhavn&pickupDate=${dates.pickup}&pickupTime=10:00&returnDate=${dates.return}&returnTime=10:00`,
  );
  await page.getByLabel("Brændstof").selectOption("ELECTRIC");
  await page.getByRole("button", { name: "Vis biler" }).click();
  await expect(page).toHaveURL(/fuel=ELECTRIC/);
  await expect(page).toHaveURL(/pickupDate=/);
  const cards = page.getByRole("article");
  await expect(cards.first()).toBeVisible();
  for (const card of await cards.all())
    await expect(card.getByText("El", { exact: true })).toBeVisible();
});

test("lukket tidspunkt giver en forklaring", async ({ page }) => {
  const dates = nextTuesday();
  await page.goto(
    `/cars?location=koebenhavn&pickupDate=${dates.pickup}&pickupTime=22:00&returnDate=${dates.return}&returnTime=10:00`,
  );
  await expect(page.getByText(/har lukket på det valgte tidspunkt/)).toBeVisible();
});

test("kontaktformularen sender en besked", async ({ page }) => {
  await page.goto("/contact");
  await page.getByLabel("Navn").fill("E2E Test");
  await page.getByLabel("E-mail").fill("e2e-kontakt@example.com");
  await page.getByLabel("Besked").fill("Dette er en test fra E2E.");
  await page.getByRole("button", { name: "Send besked" }).click();
  await expect(page.getByText("Tak for din besked")).toBeVisible();
});

test("kontaktformularen viser fejl ved ugyldig e-mail", async ({ page }) => {
  await page.goto("/contact");
  await page.getByLabel("Navn").fill("E2E Test");
  await page.getByLabel("E-mail").fill("ikke-en-mail");
  await page.getByLabel("Besked").fill("Dette er en test fra E2E.");
  await page.getByRole("button", { name: "Send besked" }).click();
  await expect(page.getByText("Skriv en gyldig e-mailadresse.")).toBeVisible();
  await expect(page.getByLabel("Navn")).toHaveValue("E2E Test");
});

for (const path of [
  "/cars",
  "/cars/volkswagen-golf",
  "/pricing",
  "/locations",
  "/locations/koebenhavn",
  "/contact",
  "/faq",
  "/terms",
  "/ar/cars",
]) {
  test(`${path} har ingen alvorlige tilgængelighedsfejl`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
  });
}
