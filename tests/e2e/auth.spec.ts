import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { totp } from "../support/totp";
import { E2E_PASSWORD, e2eUsers } from "./users";

// Unik klient-IP pr. test, så login-testene ikke deler rate limit-tæller (5 forsøg pr. minut).
test.beforeEach(async ({ page }) => {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.${octet()}.${octet()}` });
});

async function logIn(page: Page, email: string, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Log ind" }).click();
}

test.describe("uden login", () => {
  test("/account sender til login og tilbage igen", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login\?next=%2Faccount|\/login\?next=\/account/);
    await expect(page.getByRole("heading", { level: 1, name: "Log ind" })).toBeVisible();
  });

  test("/admin sender til login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("login, opret konto og glemt password virker på engelsk", async ({ page }) => {
    await page.goto("/en/login");
    await expect(page.getByRole("heading", { level: 1, name: "Log in" })).toBeVisible();
    await page.getByRole("link", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/en\/register$/);
    await page.goto("/en/forgot-password");
    await expect(page.getByRole("heading", { level: 1, name: "Forgot password" })).toBeVisible();
  });

  test("formularen viser fejl på dansk", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("button", { name: "Opret konto" }).click();
    await expect(page.getByText("Skriv dit navn.")).toBeVisible();
    await expect(page.getByText("Skriv en gyldig e-mail.")).toBeVisible();
    await expect(page.getByText("Password skal være mindst 10 tegn.")).toBeVisible();
  });

  test("forkert password giver en fejl", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(e2eUsers.customer.email);
    await page.getByLabel("Password").fill("forkert-password");
    await page.getByRole("button", { name: "Log ind" }).click();
    await expect(page.getByText("Forkert e-mail eller password.")).toBeVisible();
  });

  test("ny konto: besked om at tjekke e-mail", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Fulde navn").fill("Ny Kunde");
    await page.getByLabel("E-mail").fill(`ny-${Date.now()}-${Math.random()}@example.com`);
    await page.getByLabel("Password").fill("et-langt-password");
    await page.getByRole("button", { name: "Opret konto" }).click();
    await expect(page.getByText("Tjek din e-mail")).toBeVisible();
  });

  test("login-siderne har ingen tilgængelighedsfejl", async ({ page }) => {
    for (const path of ["/login", "/register", "/forgot-password", "/ar/login"]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, path).toEqual([]);
    }
  });
});

test.describe("roller", () => {
  test("kunde: ser sin konto, ingen adgang til admin, kan logge ud", async ({ page }) => {
    await logIn(page, e2eUsers.customer.email);
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(`Logget ind som ${e2eUsers.customer.name}`)).toBeVisible();

    const admin = await page.goto("/admin");
    expect(admin?.status()).toBe(404);

    await page.goto("/account");
    await page.getByRole("button", { name: "Log ud" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login/);
  });

  test("medarbejder: kommer til admin og ser sin adgang", async ({ page }) => {
    await logIn(page, e2eUsers.staff.email, "/admin");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText("Din rolle: Medarbejder")).toBeVisible();
    await page.getByRole("link", { name: "Sikkerhed" }).click();
    const refund = page.getByRole("row", { name: /Refundere betalinger/ });
    await expect(refund.getByRole("cell").nth(1)).toHaveText("Nej");
    const bookings = page.getByRole("row", { name: /Se bookinger og kalender/ });
    await expect(bookings.getByRole("cell").nth(1)).toHaveText("Ja");

    // Medarbejdere har ingen kundekonto.
    await page.goto("/account");
    await expect(page).toHaveURL(/\/admin$/);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("leder uden 2FA sendes til opsætning af 2FA", async ({ page }) => {
    await logIn(page, e2eUsers.manager.email, "/admin");
    await expect(page).toHaveURL(/\/admin\/security$/);
    await expect(page.getByText("Din rolle kræver totrinsbekræftelse")).toBeVisible();
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/security$/);
  });

  test("superadmin slår 2FA til og skal derefter bruge kode ved login", async ({ page }, info) => {
    const user = e2eUsers[info.project.name === "mobile" ? "2fa-mobile" : "2fa-desktop"];
    await logIn(page, user.email, "/admin");
    await expect(page).toHaveURL(/\/admin\/security$/);

    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Slå 2FA til" }).click();
    await expect(page.getByRole("img", { name: "QR-kode til godkendelses-app" })).toBeVisible();
    const secret = (await page.locator("code").textContent())!.trim();
    await page.getByLabel("Kode").fill(totp(secret));
    await page.getByRole("button", { name: "Bekræft og slå til" }).click();

    await expect(page.getByText("Gem dine backupkoder")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: /^[\w-]{10,}$/ })).toHaveCount(10);
    await page.getByRole("button", { name: "Jeg har gemt koderne" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText("Din rolle: Superadministrator")).toBeVisible();

    // Log ud og ind igen: nu kræves koden.
    await page.getByRole("button", { name: "Log ud" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await logIn(page, user.email, "/admin");
    await expect(page.getByRole("heading", { name: "Bekræft med kode" })).toBeVisible();
    await page.getByLabel("Kode").fill(totp(secret));
    await page.getByRole("button", { name: "Bekræft" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });
});
