import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Bookingflowet mod seed-data (pnpm db:seed) med simuleret betaling (FAKE_PAYMENTS=true).
 * Hver test vælger en tilfældig mandag, tirsdag eller onsdag langt ude i fremtiden (afhentning
 * kl. 10, aflevering 3 dage efter, når kontoret har åbent), så kørsler sjældent rammer samme bil.
 */
function randomPeriod() {
  const date = new Date(Date.now() + (60 + Math.floor(Math.random() * 900)) * 86_400_000);
  while (![1, 2, 3].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
  const pickup = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 3);
  return { pickup, return: date.toISOString().slice(0, 10) };
}

export function carUrl(slug = "volkswagen-golf") {
  const dates = randomPeriod();
  return `/cars/${slug}?location=koebenhavn&pickupDate=${dates.pickup}&pickupTime=10:00&returnDate=${dates.return}&returnTime=10:00`;
}

export async function expectNoSeriousA11yIssues(page: Page) {
  // Efter klient-navigation sætter Next.js titlen lidt efter indholdet; axe skal se den færdige side.
  await expect.poll(() => page.title()).not.toBe("");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
}
