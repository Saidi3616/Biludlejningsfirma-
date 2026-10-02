import "dotenv/config";
import { createHmac, randomInt, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { expectNoSeriousA11yIssues } from "./booking-helpers";
import { logInAsManager } from "./manager-helpers";

/** M14 del 1: kunden anmelder via linket fra e-mailen, og lederen publicerer (E8). */
test.beforeEach(async ({ page }) => {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.25.${octet()}.${octet()}` });
});

/** Samme hemmelighed som serveren (src/server/secrets.ts) bruger lokalt og i CI. */
const SECRET = process.env.AUTH_SECRET || "local-development-secret-not-for-production-use-0000";

function reviewToken(reference: string) {
  const signature = createHmac("sha256", SECRET)
    .update(`booking-review:${reference}`)
    .digest("base64url");
  return `${reference}.${signature}`;
}

/** En afsluttet leje sidste måned på en ny bil og for en ny kunde, så intet andet påvirkes. */
async function completedBooking() {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const reference = `BK-${Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("")}`;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows: models } = await client.query<{ id: string }>(
      `SELECT id FROM "CarModel" WHERE brand = 'Kia' AND model = 'Picanto'`,
    );
    const { rows: places } = await client.query<{ id: string }>(
      `SELECT id FROM "Location" WHERE slug = 'koebenhavn'`,
    );
    const carId = randomUUID();
    const suffix = reference.slice(3);
    await client.query(
      `INSERT INTO "Car" (id, "carModelId", "homeLocationId", "registrationNumber", vin, "odometerKm", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 5000, now())`,
      [carId, models[0]!.id, places[0]!.id, `RV ${suffix}`, `REV${suffix}`.padEnd(17, "0")],
    );
    const customerId = randomUUID();
    await client.query(
      `INSERT INTO "Customer" (id, "firstName", "lastName", email, "updatedAt")
       VALUES ($1, 'Sofie', 'Holm', 'e2e-anmeldelse@example.com', now())`,
      [customerId],
    );
    await client.query(
      `INSERT INTO "Booking" (id, reference, "customerId", "carModelId", "carId", "pickupLocationId",
         "returnLocationId", "pickupAt", "returnAt", "blockedFrom", "blockedUntil", status,
         "paymentStatus", "subtotalMinor", "totalMinor", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $5, now() - interval '30 days',
         now() - interval '27 days', now() - interval '30 days', now() - interval '27 days',
         'COMPLETED', 'PAID', 99900, 99900, now())`,
      [reference, customerId, models[0]!.id, carId, places[0]!.id],
    );
    return reference;
  } finally {
    await client.end();
  }
}

test("kunden anmelder, lederen publicerer og anmeldelsen vises", async ({ page }, info) => {
  const reference = await completedBooking();
  const comment = `Rigtig god service ${randomUUID().slice(0, 8)}`;

  await page.goto("/reviews/new?token=forkert");
  await expect(page.getByText("Linket virker ikke. Brug linket fra din e-mail.")).toBeVisible();

  await page.goto(`/reviews/new?token=${encodeURIComponent(reviewToken(reference))}`);
  await expect(page.getByRole("heading", { level: 1, name: "Bedøm din leje" })).toBeVisible();
  await expect(page.getByText("Tak fordi du lejede Kia Picanto hos os.")).toBeVisible();
  await expect(page).toHaveTitle(/Bedøm din leje/);
  await expectNoSeriousA11yIssues(page);
  await expect(page.getByRole("textbox", { name: "Vises som" })).toHaveValue("Sofie H.");

  await page.getByRole("button", { name: "Send anmeldelse" }).click();
  await expect(page.getByText("Vælg mellem 1 og 5 stjerner.")).toBeVisible();
  await page.getByText("4 stjerner").click();
  await page.getByRole("textbox", { name: /Kommentar/ }).fill(comment);
  await page.getByRole("button", { name: "Send anmeldelse" }).click();
  await expect(page.getByText("Tak for din anmeldelse!")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Du har allerede anmeldt denne leje. Tak!")).toBeVisible();

  // Lederen publicerer den.
  await logInAsManager(page, info, "reviews");
  await page.getByRole("link", { name: "Anmeldelser" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Anmeldelser" })).toBeVisible();
  await expect(page).toHaveTitle(/Anmeldelser/);
  await expectNoSeriousA11yIssues(page);
  const item = page.getByRole("listitem").filter({ hasText: comment });
  await expect(item).toContainText(`Booking ${reference}`);
  await item.getByRole("button", { name: "Publicér" }).click();
  await expect(page.getByText("Anmeldelsen er publiceret.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: comment })).toHaveCount(0);

  await page.goto("/reviews");
  await expect(page.getByText(comment)).toBeVisible();

  // Skjul den igen, så andre tests og demo-siden ikke påvirkes.
  await page.goto("/admin/reviews?status=PUBLISHED");
  await page
    .getByRole("listitem")
    .filter({ hasText: comment })
    .getByRole("button", { name: "Skjul" })
    .click();
  await expect(page.getByText("Anmeldelsen er skjult.")).toBeVisible();
});
