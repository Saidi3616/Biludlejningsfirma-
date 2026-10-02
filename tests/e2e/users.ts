/** Testbrugere til E2E. Kun til lokale/CI-databaser; aldrig rigtige personer. */
export const E2E_PASSWORD = "e2e-test-password-123";

export const e2eUsers = {
  customer: { email: "e2e-kunde@example.com", name: "E2E Kunde", role: "CUSTOMER" },
  staff: { email: "e2e-staff@example.com", name: "E2E Medarbejder", role: "STAFF" },
  manager: { email: "e2e-manager@example.com", name: "E2E Leder", role: "MANAGER" },
  // Én pr. Playwright-projekt, fordi testen ændrer brugeren (slår 2FA til).
  "2fa-mobile": { email: "e2e-2fa-mobile@example.com", name: "E2E 2FA", role: "SUPER_ADMIN" },
  "2fa-desktop": { email: "e2e-2fa-desktop@example.com", name: "E2E 2FA", role: "SUPER_ADMIN" },
} as const;
