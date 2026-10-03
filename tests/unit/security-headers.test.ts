import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/config/security-headers";

function directives(policy: string) {
  return Object.fromEntries(
    policy.split("; ").map((part) => {
      const [name, ...values] = part.split(" ");
      return [name, values];
    }),
  );
}

describe("sikkerhedsheaders (M15)", () => {
  it("tillader kun os selv og Stripe og forbyder indlejring", () => {
    const csp = directives(contentSecurityPolicy({ dev: false }));
    expect(csp["default-src"]).toEqual(["'self'"]);
    expect(csp["script-src"]).toEqual(["'self'", "'unsafe-inline'", "https://js.stripe.com"]);
    expect(csp["frame-src"]).toEqual(["https://js.stripe.com", "https://hooks.stripe.com"]);
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["form-action"]).toEqual(["'self'"]);
  });

  it("tillader eval og websockets kun under udvikling", () => {
    expect(contentSecurityPolicy({ dev: false })).not.toContain("unsafe-eval");
    expect(contentSecurityPolicy({ dev: false })).not.toContain("ws:");
    const dev = directives(contentSecurityPolicy({ dev: true }));
    expect(dev["script-src"]).toContain("'unsafe-eval'");
    expect(dev["connect-src"]).toContain("ws:");
  });

  it("sender alle de faste headers", () => {
    const keys = securityHeaders({ dev: false }).map((header) => header.key);
    expect(keys).toEqual([
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Strict-Transport-Security",
    ]);
  });
});
