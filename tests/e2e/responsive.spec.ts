import { expect, test } from "@playwright/test";

// Bredder fra kravspecifikationen §38.
const widths = [320, 375, 390, 430, 768, 1024, 1440, 1920];
const pages = ["/", "/ar", "/styleguide", "/ar/styleguide"];

test.describe("ingen vandret scroll", () => {
  test.skip(({ isMobile }) => isMobile, "Bredderne sættes manuelt; køres én gang.");

  for (const path of pages) {
    for (const width of widths) {
      test(`${path} ved ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }
});

test("WhatsApp: flydende knap på mobil, i navigationen på desktop", async ({ page, isMobile }) => {
  await page.goto("/");
  const floating = page.getByRole("link", { name: "Skriv til os på WhatsApp" });
  const inNav = page.getByRole("banner").getByRole("link", { name: "WhatsApp" });
  const [shown, hidden] = isMobile ? [floating, inNav] : [inNav, floating];
  await expect(shown).toBeVisible();
  await expect(hidden).toBeHidden();
  await expect(shown).toHaveAttribute("href", /^https:\/\/wa\.me\/\d+\?text=/);
});

test("mobilmenuen åbner og viser hovedmenuen", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Kun på mobil");
  await page.goto("/");
  await page.getByRole("button", { name: "Åbn menu" }).click();
  const dialog = page.getByRole("dialog", { name: "Menu" });
  await expect(dialog.getByRole("link", { name: "Biler" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
