# Acceptkriterier (§55) og hvor de er testet

Gennemgået 2026-10-02 (M17). Alle 34 kriterier er dækket af automatiske tests, der kører i CI på hver PR (`pnpm test` og `pnpm test:e2e`). E2E kører på mobil (Pixel 7) og desktop med simuleret betaling.

**Status:** ✅ testet lokalt og i CI. ⏳ = mangler noget fra virksomheden eller et live-miljø, før det kan godkendes på staging. Se [lancering.md](../lancering.md).

## Kunden kan …

| # | Kriterie | Test | Status |
|---|---|---|---|
| 1 | Åbne hjemmesiden | `e2e/layout.spec.ts` (alle fire sprog, RTL), `e2e/accessibility.spec.ts` | ✅ |
| 2 | Søge efter en bil | `e2e/catalog.spec.ts` "søg på forsiden → ledige biler", `integration/catalog.test.ts` | ✅ |
| 3 | Filtrere biler | `e2e/catalog.spec.ts` "filtre bevarer søgningen" | ✅ |
| 4 | Se detaljer | `e2e/catalog.spec.ts`, `e2e/seo.spec.ts` (bil-side) | ✅ |
| 5 | Vælge dato | `e2e/catalog.spec.ts`, `e2e/booking.spec.ts` | ✅ |
| 6 | Se reel tilgængelighed | `integration/availability.test.ts`, `integration/booking-constraints.test.ts`, `e2e/catalog.spec.ts` "lukket tidspunkt" | ✅ |
| 7 | Vælge ekstraudstyr | `e2e/booking.spec.ts` (GPS) | ✅ |
| 8 | Se komplet pris | `integration/pricing.test.ts`, `unit/pricing.test.ts`, `e2e/booking.spec.ts` | ✅ |
| 9 | Oprette konto eller fortsætte som gæst | `e2e/auth.spec.ts` (opret konto), `e2e/booking.spec.ts` og `e2e/account.spec.ts` (gæst) | ✅ |
| 10 | Betale | `e2e/booking.spec.ts` (afvist kort, så godkendt), `integration/payments.test.ts` | ✅ simuleret · ⏳ Stripe live |
| 11 | Modtage bekræftelse | `e2e/booking.spec.ts`, `integration/notifications.test.ts` | ✅ · ⏳ e-mailudbyder |
| 12 | Kontakte virksomheden via WhatsApp | `e2e/responsive.spec.ts` (flydende knap/navigation) | ✅ · ⏳ rigtigt nummer |
| 13 | Se sin booking | `e2e/account.spec.ts` (konto og gæstelink) | ✅ |
| 14 | Modtage påmindelse | `integration/notifications.test.ts` "påmindelser planlagt", "sender kun forfaldne beskeder" | ✅ · ⏳ cron i production |
| 15 | Aflevere bilen | `e2e/admin-handover.spec.ts` (udlevering, aflevering, afregning) | ✅ |
| 16 | Modtage afslutning | `integration/notifications.test.ts` "afsluttet leje giver tak" | ✅ |
| 17 | Give anmeldelse | `e2e/reviews.spec.ts` | ✅ |

## Virksomheden kan …

| # | Kriterie | Test | Status |
|---|---|---|---|
| 1 | Logge ind | `e2e/auth.spec.ts` (roller, 2FA) | ✅ |
| 2 | Se dashboard | `e2e/admin.spec.ts` | ✅ |
| 3 | Oprette biler | `e2e/admin-fleet-create.spec.ts` (M17), `integration/fleet.test.ts` | ✅ |
| 4 | Ændre priser | `e2e/admin-pricing.spec.ts` | ✅ |
| 5 | Se kalender | `e2e/admin.spec.ts` "kalenderen" | ✅ |
| 6 | Håndtere bookinger | `e2e/admin-actions.spec.ts` (telefonbooking, ny periode) | ✅ |
| 7 | Håndtere kunder | `e2e/admin.spec.ts`, `e2e/privacy.spec.ts` (eksport, anonymisering) | ✅ |
| 8 | Registrere betalinger | `e2e/admin-actions.spec.ts` (betaling ved skranken) | ✅ |
| 9 | Håndtere depositum | `e2e/admin-handover.spec.ts` | ✅ simuleret · ⏳ Stripe live |
| 10 | Registrere skader | `e2e/admin-handover.spec.ts` | ✅ · ⏳ fil-storage (R2/S3) |
| 11 | Håndtere service | `e2e/admin-fleet.spec.ts` | ✅ |
| 12 | Generere kontrakter | `e2e/admin-handover.spec.ts`, `unit/contract-pdf.test.ts` | ✅ · ⏳ juridisk tekst |
| 13 | Sende beskeder | `e2e/admin.spec.ts` "sender en besked" | ✅ |
| 14 | Se statistik | `e2e/reviews.spec.ts`, `integration/stats.test.ts` | ✅ |
| 15 | Administrere brugere | `e2e/admin-users.spec.ts` | ✅ |
| 16 | Administrere lokationer | `e2e/admin-catalog.spec.ts` | ✅ |
| 17 | Administrere rabatter | `e2e/admin-catalog.spec.ts` | ✅ |

## Øvrige M17-tjek

| Tjek | Hvordan | Resultat |
|---|---|---|
| Skærmbredder 320/375/390/430/768/1024/1440/1920 | `e2e/responsive.spec.ts`: ingen vandret scroll på forside, katalog, bil-side (også arabisk), priser, kontakt og login; hele bookingflowet gennemføres ved 320 px | ✅ |
| Tilgængelighed (axe, WCAG 2.1 AA) | axe på alle offentlige sider og hvert trin i booking-, konto- og admin-flows (55 kald i E2E) | ✅ ingen alvorlige fejl |
| Tilgængelighed (manuel) | Tastatur: "Gå til indhold", fokusmarkering, menuer lukker med Escape (`e2e/accessibility.spec.ts`, `e2e/responsive.spec.ts`). Lighthouse: 100 på de målte sider (M16) | ✅ · ⏳ skærmlæser-test med en rigtig bruger anbefales |
| Hastighed | Lighthouse mobil 92–99 (M16) | ✅ |
| Belastning af ledighedssøgning | `scripts/load-test.mjs` (se nedenfor) | ✅ |
| Dobbeltbooking under pres | `integration/booking.test.ts` og `booking-constraints.test.ts`: 20 samtidige forsøg, præcis én lykkes | ✅ |
| Restore af backup | `scripts/restore-test.sh` | ✅ lokalt · ⏳ på Neon |

### Belastningstest (2026-10-02, lokalt)

Én Node-proces på én CPU-kerne, Postgres på samme maskine. Halvdelen af kaldene søger i kataloget med en periode, halvdelen tjekker én bil.

| Samtidige | Kald/s | p50 | p95 | Fejl |
|---|---|---|---|---|
| 5 | 21 | 214 ms | 350 ms | 0 |
| 10 | 22 | 406 ms | 740 ms | 0 |
| 20 | 21 | 779 ms | 1.652 ms | 0 |
| 50 | 23 | 1.811 ms | 4.140 ms | 0 |

Én proces klarer ca. 20 søgninger i sekundet; derefter går tiden til kø, ikke til fejl. Flaskehalsen er CPU i Node (sidegenerering), ikke databasen (under 10 % CPU). På Vercel starter der flere instanser ved behov, så kapaciteten vokser med trafikken. Gentag testen mod staging før launch: `node scripts/load-test.mjs https://staging-adresse 10 30`.
