# B — Tech-stack

Princip: **moden, udbredt og kedelig teknologi**. Alt herunder har stor community, god dokumentation og er stabilt i produktion.

## Valgt stack

| Område | Valg | Begrundelse |
|---|---|---|
| Sprog | **TypeScript** (strict) | Ét sprog i frontend, backend og tests. Typer deles mellem API og UI. |
| Framework | **Next.js (App Router)** | Server-rendering giver SEO og hurtig første visning på mobil. Server Components, Route Handlers og Server Actions betyder, at frontend og backend kan ligge i én app uden at blive rodet. Indbygget billedoptimering, metadata-API, sitemap/robots. |
| UI | **React + Tailwind CSS** | Tailwind gør det let at håndhæve design-tokens (farver, spacing, typografi) konsekvent. |
| Komponent-primitiver | **Radix UI** (via shadcn/ui-mønstret, kopieret ind i vores kode) | Tilgængelighed (fokus, tastatur, ARIA) løst korrekt for modals, menuer, dropdowns. Vi ejer koden og styler den selv — det skal **ikke** ligne standard-shadcn. |
| Formularer | **React Hook Form + Zod** | Samme Zod-skema validerer i browser og på server. |
| Database | **PostgreSQL 16** | Relationel, transaktioner, `tstzrange` + `EXCLUDE`-constraints til dobbeltbooking, JSONB hvor nødvendigt. |
| ORM / migrationer | **Prisma** | Typesikre queries, deklarativt skema, migrationer i Git. Exclusion-constraint og `btree_gist` tilføjes som rå SQL i en migration (Prisma understøtter custom SQL i migrationsfiler). |
| Auth | **Better Auth** | Database-sessions, e-mail/password med sikker hashing, e-mail-verifikation, password reset, rate limiting, 2FA for admin, og bearer-tokens til mobilapp senere. Roller håndhæves af vores egne policies. *Alternativ: Auth.js — fravalgt pga. svagere støtte for credentials + database-sessions.* |
| Betaling | **Stripe** (Payment Element) | Kort, MobilePay, Apple Pay og Google Pay i én integration. PCI-byrden ligger hos Stripe. Refunderinger, manuel capture (depositum), webhooks. |
| E-mail | **Resend** + **React Email** | Simpelt API, EU-region, e-mail-skabeloner som React-komponenter med i18n. *Alternativ: Postmark.* |
| WhatsApp | **WhatsApp Cloud API (Meta)** bag `MessageChannel`-interface | Officiel API; ingen mellemmand nødvendig. Kan skiftes til Twilio/360dialog via adapter. |
| SMS | PHASE 2: **GatewayAPI** (dansk) eller Twilio | Samme `MessageChannel`-interface. |
| Filer | **S3-kompatibel storage** (Cloudflare R2 eller AWS S3 eu-central-1), **privat bucket**, signerede URL'er | Kørekort, kontrakter og skadesbilleder må aldrig være offentlige. Offentlige bilbilleder ligger i separat bucket/prefix. |
| PDF | **@react-pdf/renderer** | Kontrakt genereres server-side fra React-skabelon. Ingen headless browser nødvendig. |
| i18n | **next-intl** | Locale i URL (godt for SEO), ICU-pluralisering, dato/valuta-formatering, RTL via `dir`. |
| Kort | **Google Maps** (embed + Places Autocomplete til leveringsadresse) | Kendt for brugere; Places giver korrekte adresser til leveringsgebyr. |
| Baggrundsjobs | **Outbox-tabel + Vercel Cron** (hvert minut) | Ingen ekstra infrastruktur. Rækker i DB = holdbart og synligt i admin. *Skalerer vi ud over det, skiftes til Inngest eller pg-boss uden at ændre services.* |
| Rate limiting | **Upstash Redis** (`@upstash/ratelimit`) | Virker i serverless; beskytter kontakt, booking, availability. Login, tilmelding, nulstilling og 2FA bruger Better Auths indbyggede rate limiting med tællere i Postgres (tabellen `RateLimit`), så det virker uden ekstra tjeneste. *Implementeret i M3.* |
| Logging | **pino** (JSON) med redaction | Struktureret, hurtig, filtrerer følsomme felter. |
| Fejlmonitorering | **Sentry** (EU-region) | Fejl i frontend, backend og cron med kontekst — uden persondata (PII scrubbing slået til). |
| Analytics | **Plausible** (cookiefri) | Kræver ikke cookie-samtykke; respekterer GDPR. |
| Test | **Vitest** (unit/integration mod rigtig Postgres i Docker) + **Playwright** (E2E, mobile viewports) | Bookingmotor og prisberegning testes mod rigtig database, så exclusion-constraint og samtidighed faktisk bliver testet. |
| Kodekvalitet | ESLint, Prettier, TypeScript strict, Husky + lint-staged | |
| CI/CD | **GitHub Actions** | Lint, typecheck, tests, Prisma migrate check, Playwright på hver PR. |
| PWA | Web App Manifest + service worker (Serwist) | Installérbar, offline-side, cache af statiske assets. Ingen offline-booking (kræver live tilgængelighed). |

## Hosting / deployment

| Komponent | Valg | Region |
|---|---|---|
| App (web, API, cron) | **Vercel** | `fra1` (Frankfurt) |
| Database | **Neon** (managed Postgres) — alternativt Supabase eller AWS RDS | EU (Frankfurt) |
| Filer | Cloudflare R2 (EU jurisdiction) eller AWS S3 | EU |
| Redis | Upstash | EU |
| Monitorering | Sentry | EU |

Miljøer:
- **Production** — `main`-branch, eget database-projekt, rigtige Stripe live-nøgler.
- **Staging** — `development`-branch, egen database, Stripe test mode, WhatsApp test-nummer.
- **Preview** — én pr. pull request, med Neon database-branch (kopieret fra staging-seed).

Migrationer kører i CI-pipelinen (`prisma migrate deploy`) før ny version går live. Backup: Neon point-in-time recovery (7–30 dage afhængig af plan) + dagligt logisk dump til separat EU-bucket med 30 dages retention. Restore testes inden launch.

*Hvorfor ikke en VPS med Docker?* Billigere ved stor trafik, men kræver drift (patching, TLS, backup, skalering). Til en MVP er managed services mere robust. Applikationen holdes container-venlig (`next build` standalone), så flytning senere er mulig.

## Fravalg

| Fravalgt | Hvorfor |
|---|---|
| Separat backend (NestJS/Express) | Ekstra deploy, dobbelt typedefinition, mere kompleksitet uden gevinst på MVP-stadiet. Servicelaget kan løftes ud senere. |
| Microservices | Overkill. Transaktioner på tværs af booking/betaling bliver svære. |
| NoSQL (MongoDB, Firebase) | Booking kræver relationer, transaktioner og overlap-constraints. |
| Headless CMS fra start | Indhold (FAQ, vilkår) kan ligge i databasen/i18n-filer. CMS kan tilføjes i PHASE 2, hvis marketing skal redigere mange sider selv. |
| GraphQL | REST er enklere for mobil, webhooks og tredjeparter; ingen klar gevinst. |
