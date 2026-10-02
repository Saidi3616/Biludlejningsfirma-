# J — Implementeringsplan (milestones)

Hver milestone er lille nok til én eller få PR'er, ender med grøn CI og et demonstrerbart resultat, og følger §54: implementér → test → kontrollér eksisterende funktioner → ret fejl → dokumentér. Før hver milestone skrives en kort plan (hvad, hvorfor, afhængigheder, påvirkede filer, hvordan det testes) i PR-beskrivelsen.

## MVP

MVP = alt der skal til for at opfylde acceptkriterierne i §55 for både kunde (17 punkter) og virksomhed (17 punkter).

| # | Milestone | Indhold | Afhænger af | Færdig når |
|---|---|---|---|---|
| **M0** | Fundament | Next.js + TS strict, ESLint/Prettier, Tailwind, Prisma + lokal Postgres (docker-compose), `env.ts`-validering, pino-logger, Sentry, GitHub Actions CI, `main`/`development`, README, `.env.example`, Vercel staging | – | `pnpm dev` kører, CI grøn, staging-URL live |
| **M1** | Designsystem + layout + i18n | Tokens, typografi, alle `ui/`-komponenter, header/footer, WhatsApp-knap, sprogskifter, RTL-test, cookie-banner, `/styleguide` (intern side) | M0 | Alle komponenter vist i styleguide på 320 px → desktop, AA-kontrast, tastaturnavigation |
| **M2** | Datamodel + seed | Prisma-skema for alle MVP-entiteter, exclusion-constraints, seed med demo-lokationer/biler/priser | M0 | Migration kører rent; integrationstest beviser at overlap afvises |
| **M3** | Auth + roller | Better Auth, register/login/reset, e-mailverifikation, roller, policies, admin-beskyttelse, 2FA for MANAGER+, rate limiting | M2 | Tests: hver rolle kan kun det, den må |
| **M4** | Prismotor | `pricing.quote()`: lejedage, trapper, ekstraudstyr, levering, gebyrer, rabatter, depositum; `money.ts` | M2 | Omfattende unit-tests inkl. grænsetilfælde (1/2/3/6/7/29/30/31 dage, tidszoner, sommertid) |
| **M5** | Tilgængelighed + bookingmotor | `availability.search()`, åbningstider, buffer, `booking.create()` med tildeling af bil, reservation + udløb, state machine | M4 | Samtidighedstest: 20 parallelle bookinger af samme bil → præcis 1 lykkes |
| **M6** | Offentlige sider | Forside, katalog m. filtre/sortering, bil-side m. tilgængelighed, pricing, locations, about, faq, terms, privacy, cookies, contact (+formular) | M1, M4, M5 | Lighthouse mobil ≥ 90 på forside/katalog; E2E søg → bil-side |
| **M7** | Checkout + betaling | Bookingflow (trin), gæst/konto, Stripe Payment Element (kort, MobilePay, Apple/Google Pay), webhooks, idempotens, bekræftelsesside, fejlede betalinger, udløbne reservationer | M3, M5, M6 | E2E på mobil viewport: søg → betal (Stripe test) → bekræftelse; webhook-replay giver ingen dubletter |
| **M8** | Notifikationer | Outbox, cron, e-mailskabeloner (da/en), alle 7 automatiske beskeder, WhatsApp click-to-chat overalt, WhatsApp Cloud API-adapter (aktiveres når Meta-godkendelse foreligger) | M7 | Tests: e-mailfejl påvirker ikke booking; retry virker; ingen dubletter |
| **M9** | Kundekonto | /account: bookinger, betalinger/kvitteringer, dokumenter, profil, annullering, gæste-manage-link. *Dokumenter (kontrakt) vises fra M12 ✓; /account/privacy kommer i M15* | M7 | Acceptkriterie kunde 13 ✓ |
| **M10** | Admin kerne | Dashboard, bookingliste + detalje, kalender (tidslinje pr. bil), kunder, telefonbooking, send besked, annullér/refundér, ændr dato, omplacér bil | M7, M8 | Admin-kerneopgaver 1–9 (§46) kan udføres; E2E. Leveres i to PR'er: del 1 = dashboard, bookingliste/-detalje, kunder, kalender, send besked; del 2 = telefonbooking, annullér/refundér, ændr dato, omplacér bil, manuel betaling |
| **M11** | Admin flåde + drift | Bilmodeller/biler CRUD, billedupload, status/livscyklus, km, vedligehold, pickup-/retur-inspektion m. fotos, skader + før/efter, depositum hold/capture/release, tillæg (km, brændstof, forsinkelse) | M10 | Acceptkriterier virksomhed 3, 9, 10, 11 ✓. Leveres i tre PR'er: del 1 = biler og modeller CRUD, status, km, vedligehold; del 2 = billedupload (lagring), udlevering og aflevering med inspektion, fotos og skader; del 3 = depositum, tillæg og afregning (lederen godkender skadebeløb) |
| **M12** | Kontrakt | PDF-kontrakt, underskrift på skærm, versionerede vilkår, kontrakt i /account | M11 | Acceptkriterie virksomhed 12 ✓. Udlevering kræver underskrevet kontrakt; kontrakten ligger på bookingen og under /account/documents |
| **M13** | Priser, ekstra, rabatter, lokationer, levering (admin) | Prismatrix + preview, ekstraudstyr, rabatkoder, lokationer/åbningstider/leveringszoner, brugeradministration | M10 | Acceptkriterier virksomhed 4, 15, 16, 17 ✓ |
| **M14** | Anmeldelser + statistik | Anmeldelsesflow + moderation; statistik (omsætning, bookinger, belægning, gns. værdi, populære biler/kategorier, annulleringer, gentagne kunder) med periodefilter | M10 | Acceptkriterier kunde 17, virksomhed 14 ✓ |
| **M15** | GDPR + sikkerhed | Consent-log, dataeksport, anonymisering, retention-job, audit-log UI, security headers (CSP), feltkryptering verificeret, rate limits gennemgået, dependency-scan | alle | Sikkerhedstjekliste gennemgået; ingen secrets i repo (secret scanning) |
| **M16** | SEO + PWA + performance | Metadata, OG, sitemap, robots, canonical/hreflang, JSON-LD (LocalBusiness, Product/Vehicle, FAQPage), manifest, service worker, billedoptimering | M6 | Rich-results test grøn, Lighthouse ≥ 90 |
| **M17** | QA + launch | Fuld E2E-suite, tilgængelighedsaudit (axe + manuel), responsive test 320/375/390/430/tablet/desktop/large, UX-gennemgang, load-test af availability, restore-test af backup, production-miljø, Stripe live, DNS | alle | Alle 34 acceptkriterier ✓ på staging → production |

**Sprog i MVP:** i18n-infrastruktur og RTL bygges i M1, så intet senere skal omskrives. Dansk og engelsk leveres i MVP. Arabisk og fransk oversættelser leveres så snart virksomheden har godkendt tekster (se [14](14-manglende-info.md)) — teknisk er de en tekstfil hver.

## PHASE 2

| Område | Funktion |
|---|---|
| Sprog/valuta | Arabisk + fransk indhold (hvis ikke klar til MVP), betaling i EUR/GBP (MVP: visning i fremmed valuta, betaling i DKK) |
| Kommunikation | SMS-kanal; tovejs WhatsApp-indbakke i admin; kundens kanalpræferencer |
| Kunde | Selvbetjent ændring af datoer; gemte biler; fakturaer med firma-CVR |
| AI | AI-assistent (forberedt: strukturerede søge-/quote-endpoints + OpenAPI) |
| Drift | Træk-og-slip i kalender; automatisk sæson-/efterspørgselspris; MitID-signering; kørekortverifikation (fx Onfido/Veriff) |
| Forretning | Corporate accounts, loyalty, referral, langtidsleje/abonnement, multi-company |
| Teknik | Mobilapps (REST v1 + bearer tokens), telematik/GPS, headless CMS til marketing-sider, avanceret BI |
