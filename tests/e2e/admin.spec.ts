import { expect, test, type Page } from "@playwright/test";
import { carUrl, expectNoSeriousA11yIssues } from "./booking-helpers";
import { E2E_PASSWORD, e2eUsers } from "./users";

/** Adminpanelets kerne (M10): overblik, bookingliste, bookingdetalje, besked, kunder og kalender. */
test.beforeEach(async ({ page, context, baseURL }) => {
  const consent = { v: 1, at: new Date().toISOString(), analytics: false, marketing: false };
  await context.addCookies([
    { name: "consent", value: encodeURIComponent(JSON.stringify(consent)), url: baseURL! },
  ]);
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.18.${octet()}.${octet()}` });
});

/** En gæst booker og betaler (anden model end de andre specs). Returnerer bookingnummeret. */
async function guestBooking(page: Page) {
  await page.goto(carUrl("skoda-octavia-combi"));
  await page.getByRole("link", { name: "Book denne bil" }).click();
  await page.getByRole("button", { name: "Fortsæt" }).click();
  await page.getByLabel("Fornavn").fill("Admin");
  await page.getByLabel("Efternavn").fill("Testkunde");
  await page.getByLabel("E-mail").fill("e2e-admin-kunde@example.com");
  await page.getByLabel("Mobilnummer").fill("12 34 56 78");
  await page.getByRole("checkbox", { name: /lejevilkårene/ }).check();
  await page.getByRole("button", { name: "Gå til betaling" }).click();
  await page.getByRole("button", { name: /^Betal / }).click();
  await expect(page).toHaveURL(/\/booking\/confirmation\/BK-/);
  return page.url().split("/").pop()!;
}

async function logInAsStaff(page: Page) {
  await page.goto("/login?next=%2Fadmin");
  await page.getByLabel("E-mail").fill(e2eUsers.staff.email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("medarbejder finder en booking, sender en besked og ser kunden", async ({
  page,
  browser,
  baseURL,
}) => {
  const guest = await browser.newContext({ baseURL });
  const reference = await guestBooking(await guest.newPage());
  await guest.close();

  await logInAsStaff(page);
  await expect(page.getByRole("heading", { level: 1, name: "Overblik" })).toBeVisible();
  await expect(page.getByText("Udlejet nu")).toBeVisible();
  // Kun ledere ser omsætning.
  await expect(page.getByRole("heading", { name: "Denne måned" })).toHaveCount(0);
  await expectNoSeriousA11yIssues(page);

  await page.getByRole("link", { name: "Bookinger", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Bookinger" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Søg" }).fill("Admin Testkunde");
  await page.getByRole("button", { name: "Søg" }).click();
  await expect(page.getByRole("link", { name: reference })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await page.getByRole("link", { name: reference }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Booking ${reference}` })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ring op" })).toHaveAttribute(
    "href",
    "tel:+4512345678",
  );
  await expectNoSeriousA11yIssues(page);

  // Tomme felter giver fejl; en udfyldt besked sendes og vises i loggen.
  await page.getByRole("button", { name: "Send e-mail" }).click();
  await expect(page.getByText("Skal udfyldes.").first()).toBeVisible();
  await page.getByRole("textbox", { name: "Emne" }).fill("Om din afhentning");
  await page.getByRole("textbox", { name: "Besked" }).fill("Bilen holder på plads 4.");
  await page.getByRole("button", { name: "Send e-mail" }).click();
  await expect(page.getByText("E-mailen er sendt.")).toBeVisible();
  await expect(page.getByText("Bilen holder på plads 4.")).toBeVisible();

  await page.getByRole("link", { name: "Admin Testkunde" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Admin Testkunde" })).toBeVisible();
  await expect(page.getByRole("link", { name: reference })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await page.getByRole("link", { name: "Kunder", exact: true }).click();
  await page.getByRole("searchbox", { name: "Søg" }).fill("e2e-admin-kunde");
  await page.getByRole("button", { name: "Søg" }).click();
  await expect(page.getByRole("link", { name: "Admin Testkunde" }).first()).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

test("kalenderen viser bilerne og kan bladres", async ({ page }) => {
  await logInAsStaff(page);
  await page.getByRole("link", { name: "Kalender", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Kalender" })).toBeVisible();
  const url = page.url();
  await page.getByRole("link", { name: "Næste" }).click();
  await expect(page).not.toHaveURL(url);
  await expect(page.getByRole("heading", { level: 1, name: "Kalender" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});
