import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yIssues } from "./booking-helpers";
import { logInAsManager } from "./manager-helpers";

/** Administratoren retter firmaets kontaktoplysninger, og hjemmesiden viser dem med det samme. */
test.beforeEach(async ({ page }) => {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.26.${octet()}.${octet()}` });
});

test("administrator: ret kontaktoplysninger og se dem på kontaktsiden", async ({ page }, info) => {
  await logInAsManager(page, info, "settings");
  await page.getByRole("link", { name: "Indstillinger" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Indstillinger" })).toBeVisible();
  await expect(page).toHaveTitle(/Indstillinger/);
  await expectNoSeriousA11yIssues(page);

  const whatsapp = page.getByRole("textbox", { name: "WhatsApp-nummer" });
  await whatsapp.fill("12");
  await page.getByRole("button", { name: "Gem indstillinger" }).click();
  await expect(page.getByText("Skriv nummeret med landekode, fx +45 12 34 56 78.")).toBeVisible();

  // Oplysningerne er fælles for hele siden, så kun ét projekt gemmer (ellers kapløb).
  if (info.project.name === "mobile") return;
  await page.getByRole("textbox", { name: "Telefon" }).fill("+45 70 70 70 11");
  await page.getByRole("textbox", { name: "WhatsApp-nummer" }).fill("+45 20 30 40 11");
  await page.getByRole("textbox", { name: "E-mail" }).fill("kontakt@e2e-firma.dk");
  await page.getByRole("textbox", { name: "Adresse" }).fill("E2E-vej 1, 1000 København");
  await page.getByRole("button", { name: "Gem indstillinger" }).click();
  await expect(page.getByText("Indstillingerne er gemt.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "WhatsApp-nummer" })).toHaveValue("+4520304011");

  await page.goto("/contact");
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "+45 70 70 70 11" })).toBeVisible();
  await expect(main.getByText("E2E-vej 1, 1000 København")).toBeVisible();
  await expect(main.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/4520304011/,
  );
});
