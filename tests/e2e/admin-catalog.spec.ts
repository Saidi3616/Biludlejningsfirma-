import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yIssues } from "./booking-helpers";
import { logInAsManager } from "./manager-helpers";

/** M13 del 2: lederen retter rabatkoder og lokationer (F8). */
test.beforeEach(async ({ page }) => {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.24.${octet()}.${octet()}` });
});

test("leder: rabatkode og lokation med åbningstider og zoner", async ({ page }, info) => {
  await logInAsManager(page, info, "catalog");
  await page.goto("/admin/discounts");
  await expect(page.getByRole("heading", { level: 1, name: "Rabatkoder" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Rabatkoder" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page).toHaveTitle(/Rabatkoder/);
  await expectNoSeriousA11yIssues(page);

  // Rabatkode: forkert procent afvises; opret, stop og slet (den er aldrig brugt).
  const code = `E2E${randomBytes(3).toString("hex").toUpperCase()}`;
  await page.getByRole("link", { name: "Ny rabatkode" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ny rabatkode" })).toBeVisible();
  await page.getByRole("textbox", { name: "Kode", exact: true }).fill(code.toLowerCase());
  await page.getByRole("textbox", { name: "Rabat", exact: true }).fill("150");
  await page
    .getByRole("checkbox", { name: /Economy/ })
    .first()
    .check();
  await page.getByRole("button", { name: "Opret rabatkode" }).click();
  await expect(page.getByText("Procent skal være 1–100; et fast beløb mindst 1 kr.")).toBeVisible();
  await page.getByRole("textbox", { name: "Rabat", exact: true }).fill("15");
  await page.getByRole("button", { name: "Opret rabatkode" }).click();
  await expect(page.getByText("Rabatkoden er oprettet.")).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: code });
  await expect(row).toContainText("15 %");
  await expect(row).toContainText("Kun udvalgte biler");

  await row.getByRole("link", { name: code }).click();
  await expect(page.getByRole("heading", { level: 1, name: code })).toBeVisible();
  await expect(page).toHaveTitle(/Ret rabatkode/);
  await expectNoSeriousA11yIssues(page);
  await page.getByRole("checkbox", { name: /^Aktiv/ }).uncheck();
  await page.getByRole("button", { name: "Gem ændringer" }).click();
  await expect(page.getByText("Rabatkoden er gemt.")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: code })).toContainText("Stoppet");
  await page.getByRole("link", { name: code }).click();
  await page.getByRole("button", { name: "Slet rabatkoden" }).click();
  await expect(page.getByText("Rabatkoden er slettet.")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: code })).toHaveCount(0);

  // Lokation: opret som lukket for booking, så kunderne aldrig ser den.
  await page.getByRole("link", { name: "Lokationer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Lokationer" })).toBeVisible();
  await expect(page).toHaveTitle(/Lokationer/);
  await expectNoSeriousA11yIssues(page);
  await page.getByRole("link", { name: "Ny lokation" }).click();
  const slug = `e2e-${randomBytes(3).toString("hex")}`;
  const name = `E2E sted ${slug}`;
  await expect(page.getByRole("heading", { level: 1, name: "Ny lokation" })).toBeVisible();
  await page.getByRole("textbox", { name: "Navn", exact: true }).fill(name);
  await page.getByRole("textbox", { name: "Adresse på siden", exact: true }).fill(slug);
  await page.getByRole("textbox", { name: "Adresse", exact: true }).fill("Testvej 1");
  await page.getByRole("textbox", { name: "Postnummer", exact: true }).fill("1000");
  await page.getByRole("textbox", { name: "By", exact: true }).fill("København");
  await page.getByRole("textbox", { name: "Breddegrad", exact: true }).fill("55.67");
  await page.getByRole("textbox", { name: "Længdegrad", exact: true }).fill("12,56");
  await page.getByRole("checkbox", { name: /Åben for booking/ }).uncheck();
  await page.getByRole("button", { name: "Opret lokation" }).click();
  await expect(page.getByRole("textbox", { name: "Længdegrad", exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByRole("textbox", { name: "Længdegrad", exact: true }).fill("12.56");
  await page.getByRole("button", { name: "Opret lokation" }).click();
  await expect(page.getByText("Lokationen er oprettet.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page).toHaveTitle(/Ret lokation/);
  await expectNoSeriousA11yIssues(page);

  // Åbningstider: hverdage 08–18, søndag lukket.
  const hours = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Gem åbningstider" }) });
  await hours.getByRole("checkbox", { name: /Døgnåbent/ }).uncheck();
  for (const day of ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"]) {
    const group = hours.getByRole("group", { name: day });
    await group.getByLabel("Åbner").fill("08:00");
    await group.getByLabel("Lukker").fill("18:00");
  }
  await hours.getByRole("group", { name: "søndag" }).getByRole("checkbox").check();
  await hours.getByRole("button", { name: "Gem åbningstider" }).click();
  await expect(page.getByText("Åbningstiderne er gemt.")).toBeVisible();
  await expect(page.getByRole("group", { name: "mandag" }).getByLabel("Åbner")).toHaveValue(
    "08:00",
  );

  // Særlig dag og leveringszone.
  const special = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Gem dag" }) });
  await special.getByLabel("Dato").fill("2099-12-24");
  await special.getByRole("checkbox", { name: "Lukket hele dagen" }).check();
  await special.getByRole("button", { name: "Gem dag" }).click();
  await expect(page.getByText("Den særlige dag er gemt.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "24. dec. 2099" })).toBeVisible();

  const zone = page.locator("form").filter({ has: page.getByRole("button", { name: "Gem zone" }) });
  await zone.getByLabel("Op til (km)").fill("15");
  await zone.getByLabel("Pris").fill("250");
  await zone.getByRole("button", { name: "Gem zone" }).click();
  await expect(page.getByText("Zonen er gemt.")).toBeVisible();
  await expect(page.getByText("Op til 15 km")).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: "Op til 15 km" }).getByRole("button").click();
  await expect(page.getByText("Zonen er fjernet.")).toBeVisible();

  await page.getByRole("link", { name: "Alle lokationer" }).click();
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText("Lukket for booking");
});
