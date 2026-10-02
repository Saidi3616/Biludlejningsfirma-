import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { Client } from "pg";
import { expectNoSeriousA11yIssues } from "./booking-helpers";
import { logInAsManager } from "./manager-helpers";
import { E2E_PASSWORD } from "./users";

/** M15: kundens privatlivsside (samtykker, eksport, slet konto) og lederens anonymisering (F10). */
test.beforeEach(async ({ page, context, baseURL }) => {
  const consent = { v: 1, at: new Date().toISOString(), analytics: false, marketing: false };
  await context.addCookies([
    { name: "consent", value: encodeURIComponent(JSON.stringify(consent)), url: baseURL! },
  ]);
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.26.${octet()}.${octet()}` });
});

/** En ny kunde med login og kundepost, så testen kan slette den uden at påvirke andre tests. */
async function freshCustomer() {
  const email = `e2e-privat-${randomBytes(4).toString("hex")}@example.com`;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const userId = randomUUID();
    await client.query(
      `INSERT INTO "User" (id, email, name, "emailVerified", role, "updatedAt")
       VALUES ($1, $2, 'Privat Test', true, 'CUSTOMER', now())`,
      [userId, email],
    );
    await client.query(
      `INSERT INTO "Account" (id, "userId", "accountId", "providerId", password, "updatedAt")
       VALUES (gen_random_uuid(), $1::uuid, $1::text, 'credential', $2, now())`,
      [userId, await hashPassword(E2E_PASSWORD)],
    );
    const customerId = randomUUID();
    await client.query(
      `INSERT INTO "Customer" (id, "userId", "firstName", "lastName", email, "updatedAt")
       VALUES ($1, $2, 'Privat', 'Test', $3, now())`,
      [customerId, userId, email],
    );
    return { email, customerId };
  } finally {
    await client.end();
  }
}

async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test("kunden styrer samtykker, henter sine data og sletter kontoen", async ({ page }) => {
  const { email } = await freshCustomer();
  await logIn(page, email);
  await page
    .getByRole("navigation", { name: "Min konto" })
    .getByRole("link", { name: "Privatliv" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Privatliv og data" })).toBeVisible();
  await expect(page).toHaveTitle(/Privatliv og data/);
  await expectNoSeriousA11yIssues(page);

  await page.getByRole("checkbox", { name: /Nyheder og tilbud på e-mail/ }).check();
  await page.getByRole("button", { name: "Gem valg" }).click();
  await expect(page.getByText("Dine valg er gemt.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /Nyheder og tilbud på e-mail/ })).toBeChecked();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download mine data" }).click();
  const file = await download;
  const data = JSON.parse(
    await new Promise<string>((resolve, reject) => {
      file
        .createReadStream()
        .then((stream) => {
          const chunks: Buffer[] = [];
          stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
          stream.on("error", reject);
        })
        .catch(reject);
    }),
  );
  expect(data.profile.email).toBe(email);
  expect(data.profile.consents).toEqual([expect.objectContaining({ purpose: "MARKETING" })]);

  await page.getByRole("button", { name: "Slet min konto" }).click();
  await expect(page.getByText("Sæt flueben for at bekræfte.")).toBeVisible();
  await page.getByRole("checkbox", { name: /ikke kan fortrydes/ }).check();
  await page.getByRole("button", { name: "Slet min konto" }).click();
  await expect(page.getByText("Din konto er slettet.")).toBeVisible();

  // Kontoen er lukket: siden kræver login igen, og den gamle adgangskode virker ikke.
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("leder: eksport og anonymisering af en kunde", async ({ page }, info) => {
  const { customerId } = await freshCustomer();
  await logInAsManager(page, info, "gdpr");
  await page.goto(`/admin/customers/${customerId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Privat Test" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  const response = await page.request.get(`/admin/customers/${customerId}/export`);
  expect(response.status()).toBe(200);
  expect((await response.json()).profile.firstName).toBe("Privat");

  await page.getByRole("button", { name: "Anonymisér kunden" }).click();
  await expect(page.getByText("Sæt flueben for at bekræfte anonymiseringen.")).toBeVisible();
  await page.getByRole("checkbox", { name: /bedt om sletning/ }).check();
  await page.getByRole("button", { name: "Anonymisér kunden" }).click();
  await expect(page.getByText("Anonymiseringen er gennemført.")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Kunden er anonymiseret." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Anonymisér kunden" })).toHaveCount(0);
});
