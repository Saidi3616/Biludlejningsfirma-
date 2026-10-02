import { defineConfig, devices } from "@playwright/test";

const port = 3100;

// Kræver et produktionsbuild (`pnpm build`) før kørsel.
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    // Dansk browser; sproggenkendelse ville ellers sende "/" til "/en".
    locale: "da-DK",
    launchOptions: {
      // Lokalt kan en forudinstalleret Chromium bruges i stedet for at downloade.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    },
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `pnpm start -p ${port}`,
    port,
    reuseExistingServer: !process.env.CI,
    // Login-links og CSRF-tjek skal pege på testserverens adresse.
    env: { ...(process.env as Record<string, string>), AUTH_URL: `http://localhost:${port}` },
  },
});
