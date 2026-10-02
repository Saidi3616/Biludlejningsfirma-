import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yIssues } from "./booking-helpers";
import { E2E_PASSWORD, e2eUsers } from "./users";

/** M11 del 1: flåden som STAFF (læse, km og værksted; oprettelse kræver MANAGER). */
test.beforeEach(async ({ page }) => {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.21.${octet()}.${octet()}` });
});

/** En dag langt ude (efter alle andre E2E-bookinger), så besøget ikke rammer en booking. */
function farDate() {
  const date = new Date(Date.now() + (2000 + Math.floor(Math.random() * 3000)) * 86_400_000);
  return date.toISOString().slice(0, 10);
}

test("STAFF ser flåden, planlægger et værkstedsbesøg og afslutter det", async ({ page }) => {
  await page.goto("/login?next=%2Fadmin");
  await page.getByLabel("E-mail").fill(e2eUsers.staff.email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByRole("link", { name: "Flåde" }).click();
  await expect(page).toHaveURL(/\/admin\/fleet\/cars$/);
  await expect(page.getByRole("heading", { level: 1, name: "Flåde" })).toBeVisible();
  // Oprettelse af biler kræver MANAGER.
  await expect(page.getByRole("link", { name: "Ny bil" })).toHaveCount(0);
  await expectNoSeriousA11yIssues(page);

  await page.getByRole("searchbox", { name: "Søg" }).fill("DE 10");
  await page.getByRole("button", { name: "Søg" }).click();
  await expect(page).toHaveURL(/q=DE\+10/);
  const firstCar = page.getByRole("table").getByRole("link").first();
  const registration = (await firstCar.textContent())!;
  await firstCar.click();
  await expect(page.getByRole("heading", { level: 1, name: registration })).toBeVisible();
  await expect(page.getByText("I drift").first()).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  // Km kan ikke gå ned.
  await page.getByRole("textbox", { name: "Km", exact: true }).fill("0");
  await page.getByRole("button", { name: "Gem km" }).click();
  await expect(page.getByText("Kilometerstanden kan ikke være lavere end før.")).toBeVisible();

  const date = farDate();
  await page.getByLabel("Type").selectOption({ label: "Dækskift" });
  await page.getByLabel("Startdato").fill(date);
  await page.getByLabel("Slutdato").fill(date);
  await page.getByLabel("Pris (valgfri)").fill("450");
  await page.getByRole("button", { name: "Planlæg", exact: true }).click();
  await expect(page.getByText("Værkstedsbesøget er planlagt.", { exact: false })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Dækskift" }).filter({ hasText: "Planlagt" });
  await expect(row.first()).toBeVisible();
  await expect(row.first().getByText(/450\skr\./)).toBeVisible();

  // Samme periode igen afvises.
  await page.getByLabel("Type").selectOption({ label: "Rengøring" });
  await page.getByLabel("Startdato").fill(date);
  await page.getByLabel("Slutdato").fill(date);
  await page.getByRole("button", { name: "Planlæg", exact: true }).click();
  await expect(page.getByText("Bilen har allerede et værkstedsbesøg i perioden.")).toBeVisible();

  await row.first().getByRole("button", { name: "Aflys" }).click();
  await expect(page.getByText("Værkstedsbesøget er opdateret.")).toBeVisible();

  // Modeller kan ses, men ikke rettes af STAFF.
  await page.getByRole("link", { name: "Alle biler" }).click();
  await page.getByRole("link", { name: "Modeller" }).click();
  await expect(page).toHaveURL(/\/admin\/fleet\/models$/);
  await expect(page.getByRole("cell", { name: /Kia Picanto/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ny model" })).toHaveCount(0);
  await expectNoSeriousA11yIssues(page);
});
