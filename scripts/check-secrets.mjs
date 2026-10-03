// Enkel secret-scanning af filerne i git (M15): "Ingen rigtige credentials i repository."
// Kører i CI. Finder kendte nøgleformater; AWS' officielle eksempelnøgle er tilladt.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  ["Stripe-nøgle", /\b(sk|rk)_live_[A-Za-z0-9]{10,}/],
  ["Stripe test-nøgle", /\bsk_test_[A-Za-z0-9]{10,}/],
  ["Stripe webhook-secret", /\bwhsec_[A-Za-z0-9]{10,}/],
  ["AWS-nøgle", /\bAKIA[0-9A-Z]{16}\b/],
  ["Privat nøgle", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["GitHub-token", /\b(ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/],
  ["Slack-token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["Resend-nøgle", /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{10,}/],
  ["Meta/WhatsApp-token", /\bEAA[A-Za-z0-9]{60,}/],
];
const ALLOWED = ["AKIAIOSFODNN7EXAMPLE"];
const SKIP = [/^src\/generated\//, /^pnpm-lock\.yaml$/, /\.(png|jpe?g|webp|ico|woff2?|pdf)$/];

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter((file) => file && !SKIP.some((pattern) => pattern.test(file)));

const findings = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  text.split("\n").forEach((line, index) => {
    for (const [name, pattern] of PATTERNS) {
      const match = line.match(pattern);
      if (match && !ALLOWED.includes(match[0])) {
        // Selve værdien skrives aldrig ud.
        findings.push(`${file}:${index + 1}: ${name}`);
      }
    }
  });
}

if (findings.length > 0) {
  console.error(`Mulige secrets i repository:\n${findings.join("\n")}`);
  process.exit(1);
}
console.log(`Ingen secrets fundet i ${files.length} filer.`);
