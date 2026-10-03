# I — Mappestruktur

Én Next.js-app i roden (ingen monorepo i MVP — det tilføjer kompleksitet uden gevinst, før der findes en mobilapp). Når mobilappen kommer, flyttes `src/server` + `src/lib/validation` til `packages/core` i et pnpm-workspace.

```
.
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # lint, typecheck, unit/integration, e2e, migrate check
│   │   └── deploy-migrations.yml     # prisma migrate deploy (staging/production)
│   ├── pull_request_template.md
│   └── CODEOWNERS
├── docs/
│   ├── architecture/                 # dette dokumentsæt
│   ├── adr/                          # Architecture Decision Records (én fil pr. beslutning)
│   └── runbooks/                     # fx "Stripe-webhook fejler", "restore database"
├── prisma/
│   ├── schema.prisma
│   ├── migrations/                   # inkl. rå SQL for btree_gist + EXCLUDE-constraints
│   └── seed.ts                       # lokationer, kategorier, biler, priser, ekstraudstyr (demo-data)
├── messages/                         # i18n-tekster
│   ├── da.json
│   ├── en.json
│   ├── ar.json
│   └── fr.json
├── public/
│   ├── icons/                        # PWA-ikoner (scripts/generate-icons.mjs)
│   ├── sw.js                         # service worker: offline-side + cache af statiske filer
│   └── images/placeholders/
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── (public)/             # forside, cars, pricing, locations, about, contact, faq, reviews, terms, privacy, cookies
│   │   │   ├── booking/              # flow + confirmation + manage/[token]
│   │   │   ├── (auth)/               # login, register, forgot/reset-password
│   │   │   ├── account/              # Min konto
│   │   │   └── layout.tsx            # sætter lang + dir (rtl for ar)
│   │   ├── admin/                    # admin-panel (eget layout, rollebeskyttet)
│   │   ├── api/
│   │   │   ├── v1/                   # REST (route handlers — tynde, kalder services)
│   │   │   ├── auth/[...all]/        # auth-bibliotekets handler
│   │   │   ├── webhooks/{stripe,whatsapp,email}/
│   │   │   └── cron/                 # notifications, expire-reservations, ...
│   │   ├── sitemap.ts
│   │   ├── robots.ts
│   │   └── manifest.ts
│   ├── components/
│   │   ├── ui/                       # designsystem
│   │   └── features/                 # domænekomponenter (se 08-komponenter.md)
│   ├── server/                       # ALT forretningslogik — importeres aldrig fra klientkomponenter
│   │   ├── auth/                     # session, policies (can()), roller
│   │   ├── catalog/                  # car models, kategorier, søgning
│   │   ├── availability/             # ledighed, buffer, åbningstider
│   │   ├── pricing/                  # quote(), prisregler, trapper, rabatter, levering
│   │   ├── booking/                  # create, cancel, reschedule, reassign, state machine
│   │   ├── payments/                 # service + providers/stripe.ts
│   │   ├── notifications/            # NotificationService, templates/, channels/{email,whatsapp,sms}.ts
│   │   ├── fleet/                    # biler, status, vedligehold
│   │   ├── inspections/              # inspektioner, skader, sammenligning
│   │   ├── documents/                # storage, kontrakter (PDF), signerede URL'er
│   │   ├── contracts/                # M12: snapshot, PDF-skabelon og underskrift (samlet her i stedet for documents/ og pdf/)
│   │   ├── customers/
│   │   ├── reviews/
│   │   ├── messages/                 # kontakt, indbakke
│   │   ├── stats/
│   │   ├── gdpr/                     # consent, export, anonymize, retention
│   │   ├── audit/
│   │   └── db.ts                     # Prisma-klient
│   ├── lib/
│   │   ├── money.ts                  # minor units, formattering, afrunding
│   │   ├── dates.ts                  # tidszoner, lejedage-beregning
│   │   ├── validation/               # delte Zod-skemaer (bruges af både UI og server)
│   │   ├── errors.ts                 # AppError + fejlkoder
│   │   ├── logger.ts                 # pino med redaction
│   │   ├── rate-limit.ts
│   │   ├── crypto.ts                 # feltkryptering, token-hashing
│   │   └── env.ts                    # Zod-valideret process.env (app starter ikke med manglende secrets)
│   ├── i18n/                         # next-intl config, routing, locales
│   ├── emails/                       # React Email-skabeloner
│   ├── pdf/                          # kontrakt- og kvitteringsskabeloner
│   ├── styles/                       # globals.css, tokens.css
│   └── middleware.ts                 # locale-routing, admin-beskyttelse (første linje), security headers
├── tests/
│   ├── unit/                         # pricing, dates, money, policies
│   ├── integration/                  # booking-motor mod rigtig Postgres (samtidighed!), webhooks
│   ├── e2e/                          # Playwright: kundeflow + adminflow, mobil-viewports
│   └── fixtures/
├── .env.example
├── docker-compose.yml                # lokal Postgres (+ Mailpit til e-mails, Stripe CLI til webhooks)
├── README.md
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts / postcss.config.mjs
├── vitest.config.ts
└── playwright.config.ts
```

## Branch-strategi (§50)

- `main` — produktion. Kun merge fra `development` via PR (release).
- `development` — staging. Feature-branches merges hertil via PR med grøn CI.
- `feature/<kort-navn>` — én milestone eller del af en milestone pr. branch, små commits.
- Branch protection på `main` og `development`: PR påkrævet, CI grøn, ingen force-push.

## `.env.example` (udkast)

```bash
# App
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/carrental

# Auth
AUTH_SECRET=change-me
FIELD_ENCRYPTION_KEY=change-me-32-bytes-base64

# Betaling (Stripe)
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx

# E-mail
EMAIL_API_KEY=re_xxx
EMAIL_FROM="Firmanavn <booking@example.com>"

# WhatsApp
WHATSAPP_TOKEN=xxx
WHATSAPP_PHONE_NUMBER_ID=xxx
WHATSAPP_WEBHOOK_VERIFY_TOKEN=xxx
NEXT_PUBLIC_WHATSAPP_NUMBER=4512345678

# SMS (PHASE 2)
SMS_API_KEY=

# Kort
MAPS_API_KEY=xxx
NEXT_PUBLIC_MAPS_EMBED_KEY=xxx

# Storage
STORAGE_ENDPOINT=
STORAGE_BUCKET_PRIVATE=
STORAGE_BUCKET_PUBLIC=
STORAGE_ACCESS_KEY_ID=
STORAGE_SECRET_ACCESS_KEY=

# Drift
CRON_SECRET=change-me
SENTRY_DSN=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```
(Master promptens `PAYMENT_SECRET` = `STRIPE_SECRET_KEY`.)
