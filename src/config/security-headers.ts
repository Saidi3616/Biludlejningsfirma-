/**
 * Sikkerhedsheaders til alle svar (M15). Bruges af next.config.ts.
 *
 * CSP'en bruger ikke nonces: de kræver, at alle sider renderes dynamisk, og de offentlige sider
 * er statiske af hensyn til hastighed (M16). Inline-scripts er derfor tilladt (Next.js' egne og
 * cookie-tjekket), mens scripts, rammer og forbindelser kun må komme fra os selv og Stripe.
 * React escaper al tekst, så kundeindhold aldrig bliver til HTML.
 */
const STRIPE = {
  script: ["https://js.stripe.com"],
  frame: ["https://js.stripe.com", "https://hooks.stripe.com"],
  connect: ["https://api.stripe.com", "https://m.stripe.network"],
  img: ["https://*.stripe.com"],
};

export function contentSecurityPolicy(options: { dev: boolean }): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Udvikling: React bruger eval til fejlspor og hot reload.
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(options.dev ? ["'unsafe-eval'"] : []),
      ...STRIPE.script,
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...STRIPE.img],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...STRIPE.connect, ...(options.dev ? ["ws:"] : [])],
    "frame-src": STRIPE.frame,
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  // Ingen upgrade-insecure-requests: HSTS klarer det i produktion, og E2E kører over http.
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function securityHeaders(options: { dev: boolean }) {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Kameraet bruges til inspektionsfotos; Stripe kan bruge betalingsfunktionen (Apple/Google Pay).
    {
      key: "Permissions-Policy",
      value:
        'camera=(self), geolocation=(self), microphone=(), payment=(self "https://js.stripe.com")',
    },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  ];
}
