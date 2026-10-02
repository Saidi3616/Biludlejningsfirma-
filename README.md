# Biludlejningsfirma

Digital platform til biludlejning: offentlig hjemmeside med booking og betaling, kundekonto og et komplet admin-system.

Arkitekturen er beskrevet i [docs/architecture](docs/architecture/README.md), og implementeringsplanen ligger i [10-milestones.md](docs/architecture/10-milestones.md).

## Stack

Next.js 16 (App Router) og TypeScript i én applikation med et servicelag i `src/server`. Data ligger i PostgreSQL 16 via Prisma 7. Styling er Tailwind CSS 4, validering er Zod, logging er pino, og fejl sendes til Sentry. Tests kører med Vitest. Se [02-tech-stack.md](docs/architecture/02-tech-stack.md) for begrundelser.

## Installation

Kræver Node 22+, pnpm 10 og enten Docker eller en lokal PostgreSQL 16.

```bash
pnpm install                 # genererer også Prisma-klienten
cp .env.example .env         # udfyld efter behov
docker compose up -d         # Postgres på :5432, Mailpit på :8025
pnpm db:migrate              # kør migrationer
pnpm dev                     # http://localhost:3000
```

Tjek at alt kører: `curl localhost:3000/api/health` skal svare `{"status":"ok","database":"ok"}`.

## Miljøvariabler

Alle variabler står i [`.env.example`](.env.example) med den milestone, hvor de bliver påkrævede. De valideres ved opstart i [`src/lib/env.ts`](src/lib/env.ts), og appen nægter at starte, hvis en påkrævet variabel mangler. Fejlbeskeden nævner kun variablens navn, aldrig værdien.

Rigtige nøgler må aldrig committes. `.env*` er ignoreret af Git, undtagen `.env.example`.

## Database

| Kommando           | Formål                                                     |
| ------------------ | ---------------------------------------------------------- |
| `pnpm db:migrate`  | Opret og kør en ny migration under udvikling               |
| `pnpm db:deploy`   | Kør eksisterende migrationer (CI, staging, prod)           |
| `pnpm db:seed`     | Indlæs demo-data (lokationer, biler, priser, demo-brugere) |
| `pnpm db:reset`    | Slet databasen lokalt, kør alle migrationer og seed igen   |
| `pnpm db:generate` | Generér Prisma-klienten                                    |
| `pnpm db:studio`   | Åbn Prisma Studio og se data i browseren                   |

Skemaet ligger i `prisma/schema.prisma` og er beskrevet i [03-database-erd.md](docs/architecture/03-database-erd.md). Regler, som Prisma ikke kan udtrykke (beskyttelse mod dobbeltbooking, overlap med vedligehold, CHECK-constraints), ligger som SQL i migrationen `*_booking_constraints`.

Demo-data er fiktive (adresser, registreringsnumre, stelnumre) og kan ikke køres mod produktion.

## Udvikling

| Kommando            | Formål           |
| ------------------- | ---------------- |
| `pnpm dev`          | Udviklingsserver |
| `pnpm lint`         | ESLint           |
| `pnpm typecheck`    | TypeScript       |
| `pnpm format`       | Prettier (skriv) |
| `pnpm format:check` | Prettier (tjek)  |

Forretningslogik hører til i `src/server`, aldrig i komponenter. Se [09-mappestruktur.md](docs/architecture/09-mappestruktur.md).

### Login og roller

- Login, oprettelse, e-mailbekræftelse, nulstilling af password og 2FA håndteres af [Better Auth](https://www.better-auth.com) via `/api/auth/*`. Opsætningen ligger i `src/server/auth/auth.ts`.
- Hvem der må hvad, står ét sted: `src/server/auth/policies.ts` (adgangsmatricen fra [04-sitemap.md](docs/architecture/04-sitemap.md)). Sider bruger `requireCustomer()`, `requireStaff()` og `requirePermission()` fra `src/server/auth/session.ts`.
- Nye brugere er altid kunder. Medarbejdere får rolle af en SUPER_ADMIN (brugeradministration kommer i M13). MANAGER og SUPER_ADMIN skal slå 2FA til, før de får adgang til admin.
- Lokalt: sæt `SEED_ADMIN_PASSWORD` i `.env` og kør `pnpm db:seed`. Så kan du logge ind som `admin@example.com`, `manager@example.com`, `staff@example.com` og `kunde@example.com` med det password.
- E-mails (bekræftelse, nulstilling) sendes lokalt til Mailpit, når `SMTP_URL` er sat: se dem på http://localhost:8025. Uden `SMTP_URL` sendes intet lokalt. Uden for `local` kræves `EMAIL_API_KEY` (Resend) og `AUTH_SECRET`.

### Designsystem og sprog

- Alle komponenter kan ses på `/styleguide` (ikke tilgængelig i produktion).
- Design-tokens (farver, typografi, radius, skygger) ligger i `src/app/globals.css`. Brug token-klasser som `bg-brand-700`, aldrig rå farvekoder.
- Genbrugelige komponenter ligger i `src/components/ui`, sidelayout (header, footer, WhatsApp, cookie-banner) i `src/components/features/layout`.
- Al tekst ligger i `messages/{da,en,ar,fr}.json`. Dansk er standard uden præfiks (`/`), øvrige sprog har præfiks (`/en`, `/ar`, `/fr`). Arabisk vises højre-til-venstre; brug derfor logiske klasser (`ms-`, `pe-`, `start-`, `text-start`) i stedet for `ml-`, `pr-`, `left-`, `text-left`.

## Test

```bash
pnpm test               # alle tests
pnpm test:unit          # kun unit-tests
pnpm test:integration   # kræver Postgres; bruger TEST_DATABASE_URL, som tømmes
pnpm build && pnpm test:e2e   # Playwright: mobil + desktop, RTL, tilgængelighed (axe)
```

E2E-tests kræver Chromium (`pnpm exec playwright install chromium`). Har du allerede en Chromium, kan du pege på den med `PLAYWRIGHT_CHROMIUM_PATH`.

## Branches

- `main` er produktion.
- `development` er staging, og feature-branches merges hertil via PR.
- CI (lint, format, typecheck, migrationer, tests, build) skal være grøn før merge.

## Deployment

Planen er Vercel (region `fra1`) med Postgres hos Neon i EU. Production deployes fra `main`, staging fra `development`, og hver PR får et preview-miljø. Migrationer køres med `pnpm db:deploy` før en ny version går live. Appen bygges som `standalone`, så den også kan køre i en Docker-container.

Hvert miljø skal have sit eget `AUTH_SECRET` og et `AUTH_URL`, der er præcis den adresse, siden åbnes på. Ellers afviser login-API'et kaldene (CSRF-beskyttelse), og links i e-mails peger forkert. Rate limiting af login læser klientens IP fra `x-forwarded-for`, som Vercel sætter; kører appen bag en anden proxy, skal den sætte headeren.

Se [02-tech-stack.md](docs/architecture/02-tech-stack.md#hosting--deployment) for backup og miljøer.
