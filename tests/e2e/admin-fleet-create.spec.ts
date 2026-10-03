import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yIssues } from "./booking-helpers";
import { logInAsManager } from "./manager-helpers";

/** Acceptkriterie virksomhed 3: lederen opretter en bil, som derefter kan ses i flåden. */
test("leder opretter en bil i flåden", async ({ page }, info) => {
  await logInAsManager(page, info, "fleet", "/admin/fleet/cars/new");
  await page.goto("/admin/fleet/cars/new");
  await expect(page.getByRole("heading", { level: 1, name: "Ny bil" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  // Unik nummerplade og stelnummer, så testen kan køres igen mod samme database.
  const suffix = String(Date.now()).slice(-5);
  const project = info.project.name === "mobile" ? "M" : "D";
  const registration = `E${project} ${suffix.slice(0, 2)} ${suffix.slice(2)}`;
  await page.getByLabel("Model").selectOption({ index: 1 });
  await page.getByLabel("Nummerplade").fill(registration);
  await page.getByLabel("Stelnummer (VIN)").fill(`E2E${suffix}TEST${project}`);
  await page.getByRole("textbox", { name: "Km", exact: true }).fill("12");
  await page.getByRole("button", { name: "Opret bil" }).click();

  await expect(page.getByText("Bilen er oprettet.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: registration })).toBeVisible();

  // Samme nummerplade igen afvises.
  await page.goto("/admin/fleet/cars/new");
  await page.getByLabel("Model").selectOption({ index: 1 });
  await page.getByLabel("Nummerplade").fill(registration);
  await page.getByLabel("Stelnummer (VIN)").fill(`E2E${suffix}ANDEN${project}`);
  await page.getByRole("textbox", { name: "Km", exact: true }).fill("12");
  await page.getByRole("button", { name: "Opret bil" }).click();
  await expect(page.getByText("Nummerpladen eller stelnummeret findes allerede.")).toBeVisible();
});
