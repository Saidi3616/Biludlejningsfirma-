import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Læser tokens direkte fra globals.css, så testen følger designsystemet.
const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
const token = (name: string) => {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"));
  if (!match) throw new Error(`Token mangler: ${name}`);
  return match[1]!;
};

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const white = "#ffffff";

// Tekst/baggrund-par som komponenterne faktisk bruger.
const pairs: [string, string, string][] = [
  ["brødtekst", token("ink-900"), white],
  ["dæmpet tekst", token("ink-600"), white],
  ["primær knap", white, token("brand-700")],
  ["CTA-knap", token("accent-950"), token("accent-500")],
  ["fare-knap", white, token("danger-600")],
  ["WhatsApp-knap", token("whatsapp-ink"), token("whatsapp")],
  ["succes-badge", token("success-700"), token("success-50")],
  ["advarsel-badge", token("warning-700"), token("warning-50")],
  ["fare-badge", token("danger-700"), token("danger-50")],
  ["info-badge", token("info-700"), token("info-50")],
  ["brand-badge", token("brand-800"), token("brand-50")],
  ["neutral-badge", token("ink-700"), token("ink-100")],
];

describe("farvekontrast (WCAG AA, 4.5:1)", () => {
  it.each(pairs)("%s", (_, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
