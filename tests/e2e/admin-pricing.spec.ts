import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yIssues } from "./booking-helpers";
import { logInAsManager } from "./manager-helpers";
import { E2E_PASSWORD, e2eUsers } from "./users";

/** M13 del 1: lederen ser og retter priser og ekstraudstyr (F8). */
test.beforeEach(async ({ page }) => {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.23.${octet()}.${octet()}` });
});

test("leder: pristrappe, forhåndsvisning, sæsonpris og ekstraudstyr", async ({ page }, info) => {
  await logInAsManager(page, info);
  await page.getByRole("link", { name: "Priser" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Priser" })).toBeVisible();
  await expect(page).toHaveTitle(/Priser/);
  await expect(page.getByRole("heading", { name: /Pristrappe for/ })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  // Forhåndsvisning: en standardpakke fra demo-dataene.
  await page.getByLabel("Antal dage", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Beregn" }).click();
  await expect(page.getByRole("status")).toContainText("En kunde, der lejer i 3 dage, betaler:");
  await expect(page.getByRole("status")).toContainText("pakkeprisen for 3 dage");

  // Sæsonpris langt ude i fremtiden, så andre tests ikke påvirkes; slettes igen.
  const year = 2090 + Math.floor(Math.random() * 9);
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Opret pris" }) });
  await form.getByLabel("Fra antal dage").fill("3");
  await form.getByLabel("Pakkepris").fill("1.111");
  await form.getByLabel("Dagspris").fill("370");
  await form.getByLabel("Fra dato").fill(`${year}-07-01`);
  await form.getByLabel("Til dato").fill(`${year}-06-01`);
  // Enter i et tekstfelt sender formularen (på mobil dækker datovælgeren knappen).
  await form.getByLabel("Prioritet").press("Enter");
  await expect(page.getByText("Datoen skal være efter fra-datoen.")).toBeVisible();
  await form.getByLabel("Til dato").fill(`${year}-07-31`);
  await form.getByLabel("Prioritet").fill("5");
  await form.getByLabel("Prioritet").press("Enter");
  await expect(page.getByText("Prisen er oprettet.")).toBeVisible();

  await page.getByLabel("Afhentningsdato").fill(`${year}-07-10`);
  await page.getByLabel("Antal dage", { exact: true }).fill("3");
  await page.getByLabel("Antal dage", { exact: true }).press("Enter");
  await expect(page.getByRole("status")).toContainText(/1\.111\skr\./);

  const row = page.getByRole("row").filter({ hasText: `${year}` });
  await row.getByRole("link", { name: /Ret prisen for 3 dage/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ret pris" })).toBeVisible();
  await expect(page.getByLabel("Pakkepris")).toHaveValue("1111,00");
  await page.getByRole("button", { name: "Slet prisen" }).click();
  await expect(page.getByText("Prisen er slettet.")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: `${year}` })).toHaveCount(0);

  // Ekstraudstyr: opret, skjul og slet (det er aldrig booket).
  await page.getByRole("link", { name: "Ekstraudstyr" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ekstraudstyr" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Barnestol" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole("link", { name: "Nyt udstyr" }).click();
  const code = `e2e_${randomBytes(3).toString("hex")}`;
  await page.getByRole("textbox", { name: "Dansk" }).first().fill("E2E tagboks");
  await page.getByLabel("Kode").fill(code);
  await page.getByRole("textbox", { name: "Pris", exact: true }).fill("150");
  await page.getByLabel("Pris pr.").selectOption("PER_BOOKING");
  await page.getByLabel("Loft").fill("200");
  await page.getByRole("button", { name: "Opret udstyr" }).click();
  await expect(
    page.getByText("Loftet skal være mindst prisen og kun ved pris pr. dag."),
  ).toBeVisible();
  await page.getByLabel("Loft").fill("");
  await page.getByRole("button", { name: "Opret udstyr" }).click();
  await expect(page.getByText("Udstyret er oprettet.")).toBeVisible();

  await page.getByRole("link", { name: "E2E tagboks" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E tagboks" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole("checkbox", { name: /Kan vælges/ }).uncheck();
  await page.getByRole("button", { name: "Gem ændringer" }).click();
  await expect(page.getByText("Udstyret er gemt.")).toBeVisible();
  const extraRow = page.getByRole("row").filter({ hasText: "E2E tagboks" });
  await expect(extraRow.getByText("Skjult")).toBeVisible();
  await page.getByRole("link", { name: "E2E tagboks" }).click();
  await page.getByRole("button", { name: "Slet udstyret" }).click();
  await expect(page.getByText("Udstyret er slettet.")).toBeVisible();
});

test("medarbejdere ser ikke priser", async ({ page }) => {
  await page.goto("/login?next=%2Fadmin");
  await page.getByLabel("E-mail").fill(e2eUsers.staff.email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("link", { name: "Priser" })).toHaveCount(0);
  const response = await page.goto("/admin/pricing");
  expect(response?.status()).toBe(404);
});
