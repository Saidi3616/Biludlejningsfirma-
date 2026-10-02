import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yIssues } from "./booking-helpers";
import { logInAsManager } from "./manager-helpers";
import { E2E_PASSWORD, e2eUsers } from "./users";

/** M13 del 3: administratoren inviterer medarbejdere, skifter rolle og deaktiverer (F11). */
test.beforeEach(async ({ page }) => {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.25.${octet()}.${octet()}` });
});

test("administrator: invitér, skift rolle, deaktivér og aktivér", async ({ page }, info) => {
  await logInAsManager(page, info, "admin");
  await page.getByRole("link", { name: "Brugere" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Brugere" })).toBeVisible();
  await expect(page).toHaveTitle(/Brugere/);
  await expectNoSeriousA11yIssues(page);

  // Egen bruger kan ikke ændres her.
  await page.getByRole("link", { name: /\(dig\)/ }).click();
  await expect(
    page.getByText(
      "Det er dig. Din egen rolle og adgang kan kun ændres af en anden administrator.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Deaktivér brugeren" })).toHaveCount(0);

  await page.getByRole("link", { name: "Alle brugere" }).click();
  await page.getByRole("link", { name: "Invitér medarbejder" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Invitér medarbejder" })).toBeVisible();
  await expect(page).toHaveTitle(/Invitér medarbejder/);
  await expectNoSeriousA11yIssues(page);
  const email = `e2e-ny-${randomBytes(3).toString("hex")}@example.com`;
  await page.getByRole("textbox", { name: "Navn", exact: true }).fill("E2E Ny Medarbejder");
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill("ikke-en-email");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Tjek e-mailadressen.")).toBeVisible();
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill(email);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Invitationen er sendt. Linket virker i 72 timer.")).toBeVisible();
  await expect(page.getByText("Inviteret", { exact: true })).toBeVisible();
  await expect(page).toHaveTitle(/Brugere/);
  await expectNoSeriousA11yIssues(page);

  await page.getByRole("radio", { name: /^Leder/ }).check();
  await page.getByRole("button", { name: "Gem rolle" }).click();
  await expect(page.getByText("Rollen er gemt.")).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Leder/ })).toBeChecked();

  await page.getByRole("button", { name: "Send invitation igen" }).click();
  await expect(page.getByText("Invitationen er sendt igen.", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Deaktivér brugeren" }).click();
  await expect(
    page.getByText("Brugeren er deaktiveret, og alle sessioner er lukket."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Aktivér brugeren igen" }).click();
  await expect(page.getByText("Brugeren er aktiv igen.")).toBeVisible();

  await page.getByRole("link", { name: "Alle brugere" }).click();
  await expect(page.getByRole("row").filter({ hasText: email })).toContainText("Leder");
});

test("medarbejdere ser ikke brugerne", async ({ page }) => {
  await page.goto("/login?next=%2Fadmin");
  await page.getByLabel("E-mail").fill(e2eUsers.staff.email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("link", { name: "Brugere" })).toHaveCount(0);
  const response = await page.goto("/admin/users");
  expect(response?.status()).toBe(404);
});
