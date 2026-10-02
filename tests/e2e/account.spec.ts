import { expect, test, type Page } from "@playwright/test";
import { carUrl, expectNoSeriousA11yIssues } from "./booking-helpers";
import { E2E_PASSWORD, e2eUsers } from "./users";

/** Min konto, gæstens bookingside og annullering. Seed-data og simuleret betaling som booking.spec. */
test.beforeEach(async ({ page, context, baseURL }) => {
  const consent = { v: 1, at: new Date().toISOString(), analytics: false, marketing: false };
  await context.addCookies([
    { name: "consent", value: encodeURIComponent(JSON.stringify(consent)), url: baseURL! },
  ]);
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.19.${octet()}.${octet()}` });
});

async function logIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(e2eUsers.customer.email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

/** Booker og betaler en bil. Returnerer bookingnummeret. */
async function bookAndPay(page: Page, guest: boolean) {
  // En anden model end booking.spec, så de to filer ikke konkurrerer om samme bil.
  await page.goto(carUrl("toyota-corolla-hybrid"));
  await page.getByRole("link", { name: "Book denne bil" }).click();
  await page.getByRole("button", { name: "Fortsæt" }).click();
  if (guest) {
    await page.getByLabel("Fornavn").fill("E2E");
    await page.getByLabel("Efternavn").fill("Gæst");
    await page.getByLabel("E-mail").fill("e2e-gaest@example.com");
  }
  await page.getByLabel("Mobilnummer").fill("12 34 56 78");
  await page.getByRole("checkbox", { name: /lejevilkårene/ }).check();
  await page.getByRole("button", { name: "Gå til betaling" }).click();
  await expect(page).toHaveURL(/\/booking\/pay\/BK-/);
  await page.getByRole("button", { name: /^Betal / }).click();
  await expect(page).toHaveURL(/\/booking\/confirmation\/BK-/);
  return page.url().split("/").pop()!;
}

async function cancel(page: Page) {
  const section = page.getByRole("region", { name: "Annullér booking" });
  await expect(section.getByText(/Gratis annullering indtil/)).toBeVisible();
  // Uden flueben sker der intet.
  await section.getByRole("button", { name: "Annullér booking" }).click();
  await expect(section.getByText("Sæt flueben for at bekræfte")).toBeVisible();
  await section.getByRole("checkbox", { name: /annullere min booking/ }).check();
  await section.getByRole("button", { name: "Annullér booking" }).click();
  await expect(page.getByText("Din booking er annulleret")).toBeVisible();
  await expect(page.getByText("Annulleret", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Annullér booking" })).toHaveCount(0);
}

test("kunde: booking i Min konto, betalinger, kvittering og annullering", async ({ page }) => {
  await logIn(page);
  const reference = await bookAndPay(page, false);

  await page.getByRole("link", { name: "Se eller annullér din booking" }).click();
  await expect(page).toHaveURL(new RegExp(`/account/bookings/${reference}$`));
  await expect(page.getByRole("heading", { level: 1, name: `Booking ${reference}` })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await page.getByRole("link", { name: "Bookinger", exact: true }).click();
  await expect(page.getByRole("link", { name: new RegExp(reference) })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await page.getByRole("link", { name: "Betalinger", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Betalinger og kvitteringer" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: `Booking ${reference}` }).first()).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await page.goto(`/booking/${reference}/receipt`);
  await expect(
    page.getByRole("heading", { level: 1, name: `Kvittering ${reference}` }),
  ).toBeVisible();
  await expect(page.getByText(/Heraf moms/)).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await page.goto(`/account/bookings/${reference}`);
  await cancel(page);
});

test("gæst: bookingsiden virker i samme browser og kan annullere", async ({
  page,
  browser,
  baseURL,
}) => {
  const reference = await bookAndPay(page, true);
  await page.getByRole("link", { name: "Se eller annullér din booking" }).click();
  await expect(page).toHaveURL(new RegExp(`/booking/${reference}$`));
  await expectNoSeriousA11yIssues(page);

  // En anden browser uden linket får 404.
  const stranger = await browser.newContext({ baseURL });
  const response = await (await stranger.newPage()).goto(`/booking/${reference}`);
  expect(response?.status()).toBe(404);
  await stranger.close();

  await cancel(page);
  // Bekræftelsessiden sender en annulleret booking til bookingsiden.
  await page.goto(`/booking/confirmation/${reference}`);
  await expect(page).toHaveURL(new RegExp(`/booking/${reference}$`));
});

test("et ugyldigt administrér-link giver en forklaring", async ({ page }) => {
  await page.goto("/booking/manage/ugyldigt-token");
  await expect(page).toHaveURL(/\/booking\/link-invalid$/);
  await expect(page.getByRole("heading", { level: 1, name: "Linket virker ikke" })).toBeVisible();
});

test("profil: fejl vises ved forkert nummer, og ændringer gemmes", async ({ page }) => {
  await logIn(page);
  await page.getByRole("link", { name: "Profil", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Profil" })).toBeVisible();
  await page.getByLabel("Mobilnummer").fill("123");
  await page.getByRole("button", { name: "Gem" }).click();
  await expect(page.getByText(/Skriv et gyldigt mobilnummer/)).toBeVisible();
  await page.getByLabel("Mobilnummer").fill("12 34 56 78");
  await page.getByRole("button", { name: "Gem" }).click();
  await expect(page.getByText("Dine oplysninger er gemt.")).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});
