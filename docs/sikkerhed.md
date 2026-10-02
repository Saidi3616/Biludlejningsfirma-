# Sikkerhedstjekliste (M15)

Gennemgået 2026-10-02. Punkter markeret ⏳ kræver adgang til hosting, Stripe eller DNS og tjekkes før lancering (M17).

## Hemmeligheder

- ✅ Ingen secrets i repository. `pnpm check:secrets` kører i CI og finder kendte nøgleformater (Stripe, AWS, GitHub, Slack, Resend, Meta, private nøgler). Historikken er gennemgået; det eneste fund er AWS' officielle eksempelnøgle i en test.
- ✅ `.env` er i `.gitignore`; kun `.env.example` uden værdier ligger i git.
- ✅ Miljøvariabler valideres ved opstart (`src/lib/env.ts`), og kun feltnavne logges ved fejl.
- ⏳ `AUTH_SECRET`, `CRON_SECRET`, `FIELD_ENCRYPTION_KEY` og Stripe-nøgler sættes i hostingens miljøvariabler, forskellige pr. miljø.

## Persondata

- ✅ Kortdata gemmes aldrig hos os; Stripe håndterer kortet (kun mærke og sidste 4 cifre).
- ✅ Logger fjerner passwords, tokens, kort- og persondata (`src/lib/logger.ts`).
- ✅ Feltkryptering: AES-256-GCM i `src/server/crypto/fields.ts` til fødselsdato og kørekortnummer (`*Enc`). Nøglen er `FIELD_ENCRYPTION_KEY`; lokalt bruges en fast udviklingsnøgle. Testet i `tests/unit/field-encryption.test.ts`.
- ✅ Private filer (kontrakter, inspektionsfotos, kørekort) ligger under `private/` og vises kun efter adgangstjek.
- ✅ GDPR: eksport, anonymisering, samtykkelog og retention-job (M15 del 1, F10).
- ✅ Audit-log for admin- og GDPR-handlinger, læsbar for ledere på `/admin/audit-log`. Ingen persondata i `diff`.

## Web

- ✅ Sikkerhedsheaders på alle svar (`src/config/security-headers.ts`): Content-Security-Policy, HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy og Permissions-Policy.
- ✅ CSP tillader kun scripts, rammer og forbindelser fra os selv og Stripe, ingen `object`, og siden kan ikke indlejres. Inline-scripts er tilladt, fordi nonces kræver dynamisk rendering af alle sider (de offentlige sider er statiske af hensyn til hastighed). React escaper al tekst.
- ✅ Server actions og formularer har Next.js' indbyggede origin-tjek; Better Auth tjekker CSRF/origin på `AUTH_URL`.
- ✅ Al input valideres med Zod på serveren.

## Login og adgang

- ✅ Roller og rettigheder i `src/server/auth/policies.ts`; services tjekker selv adgang (`assertCan`).
- ✅ 2FA kræves for MANAGER og SUPER_ADMIN.
- ✅ Rate limits:
  - Login: 5/min.
  - Oprettelse: 3/min.
  - Nulstilling og verificering: 3 pr. 5 min.
  - 2FA: 5/min.
  - Øvrige auth-kald: 100/min.
  - Booking: 10/time pr. IP.
  - Kontaktformular: 5/time pr. IP.
  - Cookie-samtykke: 20/min.
- ✅ Gæstelinks (administrér booking, anmeldelse) er 256-bit tokens eller HMAC-signerede, så de ikke kan gættes; ukendte referencer giver 404.

## Afhængigheder

- ✅ `pnpm audit --prod --audit-level=high` kører i CI. Sårbarheder i Prisma-CLI'ens transitive afhængigheder (lodash, mysql2, deepmerge-ts) er rettet med overrides i `pnpm-workspace.yaml`.
- ✅ Dependabot åbner ugentlige PR'er mod `development` (`.github/dependabot.yml`).

## Før lancering (M17)

- ⏳ Stripe live-nøgler og webhook-secret i production.
- ⏳ Tjek headers på production-domænet (fx securityheaders.com) og HSTS preload.
- ⏳ Cron-jobs med `CRON_SECRET`: expire-reservations og notifications hvert minut, retention dagligt.
- ⏳ Backup og restore-test af databasen.
