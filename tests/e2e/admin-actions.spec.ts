import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yIssues } from "./booking-helpers";
import { E2E_PASSWORD, e2eUsers } from "./users";

/** M10 del 2: telefonbooking, betaling ved skranken og ny periode. */
test.beforeEach(async ({ page }) => {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.20.${octet()}.${octet()}` });
});

async function logInAsStaff(page: Page) {
  await page.goto("/login?next=%2Fadmin%2Fbookings");
  await page.getByLabel("E-mail").fill(e2eUsers.staff.email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page).toHaveURL(/\/admin\/bookings$/);
}

/** En tilfældig mandag-onsdag langt ude, så kørsler ikke rammer samme bil. */
function randomDates() {
  const date = new Date(Date.now() + (60 + Math.floor(Math.random() * 900)) * 86_400_000);
  while (![1, 2, 3].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
  const pickup = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 2);
  const ret = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 1);
  return { pickup, return: ret, later: date.toISOString().slice(0, 10) };
}

test("telefonbooking med betalingslink, betaling ved skranken og ny periode", async ({ page }) => {
  await logInAsStaff(page);
  await page.getByRole("link", { name: "Ny booking" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ny booking" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  // Uden kunde og bil vises fejl, og felterne beholder deres værdier.
  await page.getByLabel("Fornavn").fill("Telefon");
  await page.getByRole("button", { name: "Opret booking" }).click();
  await expect(page.getByText("Tjek de markerede felter.")).toBeVisible();
  await expect(page.getByLabel("Fornavn")).toHaveValue("Telefon");

  const dates = randomDates();
  await page.getByLabel("Efternavn").fill("Kunde");
  await page.getByRole("textbox", { name: "E-mail" }).fill("e2e-telefon@example.com");
  await page.getByLabel("Mobilnummer").fill("12 34 56 78");
  await page.getByLabel("Bilmodel").selectOption({ label: "Kia Picanto" });
  await page.getByLabel("Afhentningssted").selectOption({ label: "København" });
  await page.getByLabel("Afleveringssted").selectOption({ label: "København" });
  await page.getByLabel("Afhentningsdato").fill(dates.pickup);
  await page.getByLabel("Afhentningstid").fill("10:00");
  await page.getByLabel("Afleveringsdato").fill(dates.return);
  await page.getByLabel("Afleveringstid").fill("10:00");
  await page.getByRole("button", { name: "Opret booking" }).click();

  await expect(page).toHaveURL(/\/admin\/bookings\/BK-[A-Z0-9]+\?notice=linkSent$/);
  await expect(page.getByText(/kunden får et betalingslink/)).toBeVisible();
  await expect(page.getByText("Betalingslink").first()).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  // Kunden betaler kontant ved skranken.
  const payment = page.getByRole("region", { name: "Handlinger" });
  await payment.getByRole("button", { name: "Registrér betaling" }).click();
  await expect(page.getByText("Betalingen er registreret.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Manuel betaling" })).toBeVisible();

  // Ny periode: forhåndsvisning og bekræftelse.
  await page.getByLabel("Afleveringsdato").fill(dates.later);
  await page.getByRole("button", { name: "Se ændringen" }).click();
  await expect(page.getByRole("heading", { name: "Sådan bliver bookingen" })).toBeVisible();
  await page.getByRole("button", { name: "Bekræft ændringen" }).click();
  await expect(page.getByText("Bookingen er flyttet, og kunden får besked.")).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});
