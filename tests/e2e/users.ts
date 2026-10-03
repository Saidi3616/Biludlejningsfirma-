/** Testbrugere til E2E. Kun til lokale/CI-databaser; aldrig rigtige personer. */
export const E2E_PASSWORD = "e2e-test-password-123";

export const e2eUsers = {
  customer: { email: "e2e-kunde@example.com", name: "E2E Kunde", role: "CUSTOMER" },
  staff: { email: "e2e-staff@example.com", name: "E2E Medarbejder", role: "STAFF" },
  manager: { email: "e2e-manager@example.com", name: "E2E Leder", role: "MANAGER" },
  // Én pr. Playwright-projekt, fordi testen ændrer brugeren (slår 2FA til).
  "2fa-mobile": { email: "e2e-2fa-mobile@example.com", name: "E2E 2FA", role: "SUPER_ADMIN" },
  "2fa-desktop": { email: "e2e-2fa-desktop@example.com", name: "E2E 2FA", role: "SUPER_ADMIN" },
  // Ledere til lederens sider; testen slår 2FA til, så én pr. testfil og projekt.
  "manager-mobile": { email: "e2e-manager-mobile@example.com", name: "E2E Leder", role: "MANAGER" },
  "manager-desktop": {
    email: "e2e-manager-desktop@example.com",
    name: "E2E Leder",
    role: "MANAGER",
  },
  "catalog-mobile": { email: "e2e-catalog-mobile@example.com", name: "E2E Leder", role: "MANAGER" },
  "catalog-desktop": {
    email: "e2e-catalog-desktop@example.com",
    name: "E2E Leder",
    role: "MANAGER",
  },
  "reviews-mobile": { email: "e2e-reviews-mobile@example.com", name: "E2E Leder", role: "MANAGER" },
  "reviews-desktop": {
    email: "e2e-reviews-desktop@example.com",
    name: "E2E Leder",
    role: "MANAGER",
  },
  "gdpr-mobile": { email: "e2e-gdpr-mobile@example.com", name: "E2E Leder", role: "MANAGER" },
  "gdpr-desktop": { email: "e2e-gdpr-desktop@example.com", name: "E2E Leder", role: "MANAGER" },
  "fleet-mobile": { email: "e2e-fleet-mobile@example.com", name: "E2E Leder", role: "MANAGER" },
  "fleet-desktop": { email: "e2e-fleet-desktop@example.com", name: "E2E Leder", role: "MANAGER" },
  "admin-mobile": { email: "e2e-admin-mobile@example.com", name: "E2E Admin", role: "SUPER_ADMIN" },
  "admin-desktop": {
    email: "e2e-admin-desktop@example.com",
    name: "E2E Admin",
    role: "SUPER_ADMIN",
  },
  "settings-mobile": {
    email: "e2e-settings-mobile@example.com",
    name: "E2E Admin",
    role: "SUPER_ADMIN",
  },
  "settings-desktop": {
    email: "e2e-settings-desktop@example.com",
    name: "E2E Admin",
    role: "SUPER_ADMIN",
  },
} as const;
