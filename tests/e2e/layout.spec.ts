import { expect, test } from "@playwright/test";

const locales = [
  { path: "/", lang: "da", dir: "ltr", title: "Find din bil" },
  { path: "/en", lang: "en", dir: "ltr", title: "Find your car" },
  { path: "/ar", lang: "ar", dir: "rtl", title: "اعثر على سيارتك" },
  { path: "/fr", lang: "fr", dir: "ltr", title: "Trouvez votre voiture" },
];

for (const locale of locales) {
  test(`forsiden på ${locale.lang} har korrekt sprog og retning`, async ({ page }) => {
    await page.goto(locale.path);
    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", locale.lang);
    await expect(html).toHaveAttribute("dir", locale.dir);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(locale.title);
  });
}

test("ukendte sider giver en oversat 404", async ({ page }) => {
  const response = await page.goto("/en/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
});

test("sprogskift bevarer siden og skifter URL", async ({ page, isMobile }) => {
  await page.goto("/styleguide");
  if (isMobile) await page.getByRole("button", { name: "Åbn menu" }).click();
  await page.getByRole("combobox", { name: "Sprog" }).selectOption("ar");
  await expect(page).toHaveURL(/\/ar\/styleguide$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});
