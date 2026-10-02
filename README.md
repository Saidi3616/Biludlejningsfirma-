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

| Kommando           | Formål                                           |
| ------------------ | ------------------------------------------------ |
| `pnpm db:migrate`  | Opret og kør en ny migration under udvikling     |
| `pnpm db:deploy`   | Kør eksisterende migrationer (CI, staging, prod) |
| `pnpm db:generate` | Generér Prisma-klienten                          |
| `pnpm db:studio`   | Åbn Prisma Studio                                |

Skemaet ligger i `prisma/schema.prisma`. Datamodellen tilføjes i M2.

## Udvikling

| Kommando            | Formål           |
| ------------------- | ---------------- |
| `pnpm dev`          | Udviklingsserver |
| `pnpm lint`         | ESLint           |
| `pnpm typecheck`    | TypeScript       |
| `pnpm format`       | Prettier (skriv) |
| `pnpm format:check` | Prettier (tjek)  |

Forretningslogik hører til i `src/server`, aldrig i komponenter. Se [09-mappestruktur.md](docs/architecture/09-mappestruktur.md).

## Test

```bash
pnpm test               # alle tests
pnpm test:unit          # kun unit-tests
pnpm test:integration   # kræver en kørende database
```

## Branches

- `main` er produktion.
- `development` er staging, og feature-branches merges hertil via PR.
- CI (lint, format, typecheck, migrationer, tests, build) skal være grøn før merge.

## Deployment

Planen er Vercel (region `fra1`) med Postgres hos Neon i EU. Production deployes fra `main`, staging fra `development`, og hver PR får et preview-miljø. Migrationer køres med `pnpm db:deploy` før en ny version går live. Appen bygges som `standalone`, så den også kan køre i en Docker-container.

Se [02-tech-stack.md](docs/architecture/02-tech-stack.md#hosting--deployment) for backup og miljøer.
