import { expect, type Page, type TestInfo } from "@playwright/test";
import { totp } from "../support/totp";
import { E2E_PASSWORD, e2eUsers } from "./users";

/**
 * Logger ind som leder. Ledere skal have 2FA (F11), så første gang slås det til med en kode fra
 * den viste nøgle. Brugeren nulstilles af global-setup før hver kørsel. Hver testfil bruger sin
 * egen leder (`who`), fordi 2FA kun kan slås til én gang pr. kørsel.
 */
export async function logInAsManager(
  page: Page,
  info: TestInfo,
  who: "manager" | "catalog" | "admin" = "manager",
  next = "/admin",
) {
  const user = e2eUsers[`${who}-${info.project.name === "mobile" ? "mobile" : "desktop"}`];
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page).toHaveURL(/\/admin\/security$/);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Slå 2FA til" }).click();
  const secret = (await page.locator("code").textContent())!.trim();
  await page.getByLabel("Kode").fill(totp(secret));
  await page.getByRole("button", { name: "Bekræft og slå til" }).click();
  await page.getByRole("button", { name: "Jeg har gemt koderne" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
