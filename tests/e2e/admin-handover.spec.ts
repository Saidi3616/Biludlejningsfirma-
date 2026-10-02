import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { expectNoSeriousA11yIssues } from "./booking-helpers";
import { E2E_PASSWORD, e2eUsers } from "./users";

/** M11 del 2: udlevering og aflevering med fotos og skader (F1, F2). */
test.beforeEach(async ({ page }) => {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.22.${octet()}.${octet()}` });
});

/** 1×1 PNG. Serveren gemmer det som WebP. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * En betalt booking med afhentning for en time siden på en ny bil, så testen ikke
 * deler bil med andre tests eller demo-data.
 */
async function bookingReadyForPickup() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const suffix = randomBytes(3).toString("hex").toUpperCase();
    const { rows: models } = await client.query<{ id: string }>(
      `SELECT id FROM "CarModel" WHERE brand = 'Kia' AND model = 'Picanto'`,
    );
    const { rows: places } = await client.query<{ id: string }>(
      `SELECT id FROM "Location" WHERE slug = 'koebenhavn'`,
    );
    const carId = randomUUID();
    await client.query(
      `INSERT INTO "Car" (id, "carModelId", "homeLocationId", "registrationNumber", vin, "odometerKm", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 5000, now())`,
      [carId, models[0]!.id, places[0]!.id, `EE ${suffix}`, `E2E${suffix}`.padEnd(17, "0")],
    );
    const customerId = randomUUID();
    await client.query(
      `INSERT INTO "Customer" (id, "firstName", "lastName", email, "updatedAt")
       VALUES ($1, 'Udlevering', 'Test', 'e2e-udlevering@example.com', now())`,
      [customerId],
    );
    const bookingId = randomUUID();
    const reference = `BK-E2E${suffix}`;
    await client.query(
      `INSERT INTO "Booking" (id, reference, "customerId", "carModelId", "carId", "pickupLocationId",
         "returnLocationId", "pickupAt", "returnAt", "blockedFrom", "blockedUntil", status,
         "paymentStatus", "subtotalMinor", "totalMinor", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $6, now() - interval '1 hour', now() + interval '2 days',
         now() - interval '1 hour', now() + interval '2 days', 'CONFIRMED', 'PAID', 99900, 99900, now())`,
      [bookingId, reference, customerId, models[0]!.id, carId, places[0]!.id],
    );
    await client.query(
      `INSERT INTO "Payment" (id, "bookingId", kind, status, method, "amountMinor", currency, provider, "updatedAt")
       VALUES (gen_random_uuid(), $1, 'MANUAL', 'SUCCEEDED', 'CASH', 99900, 'DKK', 'manual', now())`,
      [bookingId],
    );
    return reference;
  } finally {
    await client.end();
  }
}

test("udlevering og aflevering med km, fotos og skader", async ({ page }) => {
  const reference = await bookingReadyForPickup();
  await page.goto(`/login?next=%2Fadmin%2Fbookings%2F${reference}`);
  await page.getByLabel("E-mail").fill(e2eUsers.staff.email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(reference) })).toBeVisible();

  // Udlevering: lavere km afvises, derefter udleveres bilen.
  await page.getByRole("link", { name: "Udlevér bil" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Udlevér bil" })).toBeVisible();
  await expect(page.getByText("Bilen har ingen kendte skader.")).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole("textbox", { name: "Km-stand" }).fill("4000");
  await page.getByRole("button", { name: "Udlevér bilen" }).click();
  await expect(page.getByText("Km-standen kan ikke være lavere end før.")).toBeVisible();
  await page.getByRole("textbox", { name: "Km-stand" }).fill("5100");
  await page.getByLabel("Brændstof eller batteri").selectOption({ label: "7/8" });
  await page.getByRole("button", { name: "Udlevér bilen" }).click();

  await expect(page).toHaveURL(/\/admin\/inspections\/[0-9a-f-]+\?notice=pickedUp$/);
  await expect(page.getByText("Bilen er udleveret.", { exact: false })).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "bil.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(page.getByRole("img", { name: "Foto 1 af bilen" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  // En eksisterende skade registreres ved udlevering.
  await page.getByLabel("Område").selectOption({ label: "Bag venstre" });
  await page.getByLabel("Beskrivelse").fill("Lille ridse i kofangeren");
  await page.getByRole("button", { name: "Registrér skade" }).click();
  await expect(page.getByText("Skaden er registreret.", { exact: false })).toBeVisible();
  await expect(page.getByText("Kendt skade")).toBeVisible();

  // Aflevering.
  await page.getByRole("link", { name: `Tilbage til ${reference}` }).click();
  await expect(page.getByText("Aktiv").first()).toBeVisible();
  await page.getByRole("link", { name: "Modtag bil" }).click();
  await expect(page.getByText("Lille ridse i kofangeren")).toBeVisible();
  await page.getByRole("textbox", { name: "Km-stand" }).fill("5420");
  await page.getByLabel("Skal tjekkes eller rengøres først").check();
  await page.getByRole("button", { name: "Modtag bilen" }).click();

  await expect(page).toHaveURL(/\?notice=returned$/);
  await expect(page.getByText("Kørt 320 km")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Til sammenligning: Udlevering" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Udlevering, foto 1" })).toBeVisible();

  await page.getByRole("link", { name: `Tilbage til ${reference}` }).click();
  await expect(page.getByText("Afsluttet").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Aflevering" })).toBeVisible();
});
