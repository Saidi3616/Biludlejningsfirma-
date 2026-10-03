import { describe, expect, it } from "vitest";
import { authEmail } from "@/server/email/auth-emails";

const input = { to: "a@example.com", name: "Ana", url: "https://example.dk/reset-password/abc" };

describe("login-e-mails", () => {
  it("bruger modtagerens sprog og indeholder linket", () => {
    const email = authEmail("reset", { ...input, locale: "en" });
    expect(email.subject).toBe("Reset your password");
    expect(email.text).toContain(input.url);
    expect(email.html).toContain(`href="${input.url}"`);
    expect(email.html).toContain('lang="en"');
  });

  it("arabisk skrives fra højre mod venstre", () => {
    expect(authEmail("verify", { ...input, locale: "ar" }).html).toContain('dir="rtl"');
  });

  it("ukendt sprog falder tilbage til dansk", () => {
    expect(authEmail("verify", { ...input, locale: "xx" }).subject).toBe("Bekræft din e-mail");
  });

  it("escaper navnet i HTML", () => {
    const email = authEmail("existing", { ...input, name: "<script>x</script>", locale: "da" });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});
