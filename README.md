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

### Priser

- Al prisberegning sker i én ren funktion, `quote()` i `src/server/pricing/quote.ts`. `getQuote()` i `service.ts` henter data fra databasen og kalder den.
- Regler, som virksomheden skal bekræfte (tolerance for sen aflevering, længste leje, grænse for depositum-hold, moms), står i `src/config/rental.ts`.
- Pristrappen, sommertid og alle grænsetilfælde er dækket af `tests/unit/pricing.test.ts` og `tests/unit/dates.test.ts`.

### Ledighed og booking

- `searchAvailability()` og `checkAvailability()` i `src/server/availability/service.ts` finder ledige modeller i en periode. Åbningstider, mindste varsel og klargøringsbuffer (fra lokationen) tjekkes på serveren.
- `createBooking()` i `src/server/booking/create.ts` opretter en reservation (`PENDING_PAYMENT`, 15 minutter) og tildeler en konkret bil. Databasens constraint afgør, hvem der får bilen, hvis to booker samtidig; taberen prøver næste bil eller får `CAR_NO_LONGER_AVAILABLE`.
- Statusskift går altid gennem `transitionBooking()` i `src/server/booking/state.ts`, som også logger skiftet.
- `/api/cron/expire-reservations` frigiver ubetalte reservationer. Den kræver `Authorization: Bearer $CRON_SECRET` og skal kaldes hvert minut. Udløbne reservationer frigives også, lige før en ny booking oprettes.

### Offentlige sider

- Forside, `/cars` (katalog med søgning og filtre), `/cars/[slug]`, `/pricing`, `/locations`, `/about`, `/faq`, `/reviews`, `/contact` samt `/terms`, `/privacy` og `/cookies`.
- Søgning og filtre ligger i URL'en (`/cars?location=koebenhavn&pickupDate=…`), så links kan deles, og formularerne virker uden JavaScript. Ugyldige værdier ignoreres (`src/lib/validation/search.ts`).
- Data hentes via `src/server/catalog/service.ts`. Modeller uden pris vises ikke. Med sted og periode vises kun ledige modeller med totalpris; ellers "fra"-pris pr. dag.
- Kontaktformularen gemmer en besked (`src/server/contact/service.ts`) med højst 5 beskeder pr. IP i timen og et skjult felt mod robotter.
- Vilkår og privatlivspolitik er udkast og skal godkendes af virksomheden/en jurist før lancering.

### Booking og betaling

- Flowet: `/booking` (trin 1 ekstraudstyr, levering og rabatkode; trin 2 oplysninger og vilkår) → `/booking/pay/[reference]` → `/booking/confirmation/[reference]`. Valgene ligger i URL'en; prisen beregnes altid på serveren.
- Betalings- og bekræftelsessiden kan kun ses af den, der oprettede bookingen (login eller en httpOnly-cookie med gæstens token). Andre får 404.
- Betaling går gennem `PaymentProvider` (`src/server/payments`). Med `STRIPE_SECRET_KEY` bruges Stripe Payment Element (kort, MobilePay, Apple Pay, Google Pay efter opsætningen i Stripe). Kortdata rører aldrig vores server.
- Bookingen bekræftes kun af webhooken `POST /api/webhooks/stripe`. Hvert event gemmes i `ProcessedWebhook`, så samme event aldrig behandles to gange. Lander en betaling på en booking, der ikke kan bekræftes (fx bilen er taget efter udløb), refunderes den automatisk.
- Lokalt og i CI uden Stripe: sæt `FAKE_PAYMENTS=true` (kun med `APP_ENV=local`). Betalingssiden viser så knapper til at gennemføre eller afvise en testbetaling.
- Stripe lokalt: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` og sæt `STRIPE_WEBHOOK_SECRET` til den viste `whsec_…`.
- Webhooken i Stripe skal sende `payment_intent.succeeded`, `payment_intent.payment_failed` og `payment_intent.amount_capturable_updated` (depositum reserveret).

### Notifikationer

- Beskeder skrives som `Notification`-rækker i samme transaktion som bookingens statusskift (`src/server/notifications/queue.ts`). Påmindelser får et `scheduledAt`, så der ikke er brug for et separat planlægnings-job.
- `/api/cron/retention` sletter dokumenter efter deres retention-frist og rydder udløbne sessioner og login-links (GDPR). Den kræver `Authorization: Bearer $CRON_SECRET` og skal kaldes én gang i døgnet.
- `/api/cron/notifications` sender beskeder, hvis tid er kommet. Den kræver `Authorization: Bearer $CRON_SECRET` og skal kaldes hvert minut. Fejl prøves igen efter 1, 5, 15 og 60 minutter; efter 5 forsøg markeres beskeden `FAILED`.
- Tidspunkter for påmindelser og retry står i `src/config/notifications.ts`, teksterne i `messages/*.json` under `notifications`.
- E-mail sendes altid. WhatsApp sendes kun, når `WHATSAPP_TOKEN` og `WHATSAPP_PHONE_NUMBER_ID` er sat, og kunden har et telefonnummer.
- WhatsApp-skabeloner skal godkendes i Meta Business Manager med disse navne og parametre (i rækkefølge, på da/en/fr/ar):
  - `booking_confirmed`: fornavn, bookingnummer, bil, afhentningstid, afhentningssted
  - `payment_received`: fornavn, beløb, bookingnummer
  - `car_ready`: fornavn, bil, afhentningssted
  - `pickup_reminder`: fornavn, bil, afhentningstid, adresse
  - `return_reminder`: fornavn, afleveringstid, afleveringssted
  - `thank_you`: fornavn
  - `review_request`: fornavn, link til anmeldelse
  - `booking_cancelled`: fornavn, bookingnummer, refusionsbeløb
  - `payment_request`: fornavn, bookingnummer, beløb, betalingslink
  - `booking_changed`: fornavn, bookingnummer, ny afhentning, ny aflevering

### Min konto og annullering

- `/account` viser kundens bookinger, `/account/payments` betalinger og refusioner, `/account/profile` navn, mobilnummer og sprog. Gæstebookinger med samme e-mail knyttes automatisk til kontoen, når kunden logger ind (e-mailen er verificeret).
- Gæster får et link i e-mailen (`/booking/manage/<token>`). Tokenet er signeret med `AUTH_SECRET`; kun hashen gemmes på bookingen. Linket giver adgang i browseren og sender videre til `/booking/<reference>`.
- Annullering følger `cancellationPolicy` i `src/config/rental.ts` (forslag, skal godkendes af virksomheden). Kunden ser beløbet, før annulleringen bekræftes. Fejler refusionen hos Stripe, står den som ventende til personalet.
- Kvitteringen (`/booking/<reference>/receipt`) kan printes eller gemmes som PDF.

### Admin

- `/admin` er dagens overblik i dansk tid: afhentninger og afleveringer, ledige biler, ting der kræver handling (ubetalte bookinger, ventende refusioner, fejlede beskeder, nye henvendelser) og, for ledere, månedens omsætning.
- `/admin/bookings` søger på bookingnummer, navn, e-mail, telefon og nummerplade. Bookingdetaljen viser linjer, betalinger, historik og beskeder, og medarbejderen kan ringe, skrive på WhatsApp eller sende en e-mail til kunden. Sendte e-mails gemmes i kommunikationsloggen og i audit-loggen.
- `/admin/customers` viser kunder og deres bookinger; `/admin/calendar` viser hver bil som en række med bookinger og værkstedsbesøg for 1 eller 2 uger.
- `/admin/bookings/new` er telefon- og skrankebooking med samme regler og priser som hjemmesiden. Kunden får enten et betalingslink på e-mail (reservationen holdes i 24 timer) eller betaler ved skranken (bookingen bekræftes med det samme).
- På bookingen kan medarbejdere registrere en betaling (kontant, kort-terminal, MobilePay, bankoverførsel), flytte perioden (samme bil hvis muligt, ellers en anden af samme model; prisen beholdes eller beregnes forfra) og give bookingen en anden bil. Ledere kan annullere med en foreslået refusion, som kan overstyres med en årsag, refundere og prøve en fejlet refusion igen.
- Refusioner fordeles på bookingens betalinger: kortbetalinger refunderes hos betalingsudbyderen, kontante betalinger registreres som betalt tilbage ved skranken (`src/server/payments/refunds.ts`).
- `/admin/fleet/cars` viser flåden med status, km og frister (syn, service og forsikring inden for 30 dage markeres). På bilen kan medarbejdere skifte driftsstatus, rette km og planlægge værkstedsbesøg; bilen kan ikke bookes i et besøg, og et besøg kan ikke lægges oven i en booking. Har bilen kommende bookinger, vises de, og en statusændring skal bekræftes; bookingerne flyttes fra bookingsiden. Ledere opretter og retter biler (købsprisen ses kun af ledere) og katalogmodeller på `/admin/fleet/models` (specifikationer, km-regler, depositum, beskrivelse på fire sprog, synlighed).
- Adgang styres af rollerne i `src/server/auth/policies.ts`; admin er kun på dansk. Alle handlinger skrives i audit-loggen.

### Udlevering, aflevering og filer

- På bookingen starter "Udlevér bil" udleveringen (bekræftet og betalt booking, tidligst på afhentningsdagen): km og brændstof registreres, bookingen bliver aktiv, og personalet tager fotos og registrerer kendte skader på inspektionssiden (`/admin/inspections/[id]`). "Modtag bil" afslutter bookingen, sætter bilens km og status og viser udleveringens fotos til sammenligning; nye skader knyttes til bookingen.
- Udlevering kræver depositum, hvis modellen har et: "Tag depositum" på bookingen lader kunden indtaste kortet på personalets skærm (reservation ved lejer op til 7 dage, ellers træk og tilbagebetaling, K6), eller personalet registrerer det kontant eller på terminalen.
- Før udlevering underskriver kunden lejekontrakten på skærmen ("Underskriv kontrakt" på bookingen). Kontrakten gemmes som PDF med vilkår og priser, som de var ved underskriften, og kunden kan hente den på sin booking og under "Dokumenter" i Min konto. Lejebetingelserne i `messages/*.json` (`terms.sections`) er et udkast, som en jurist skal gennemgå.
- Ledere retter priser på `/admin/pricing` (pristrappe pr. kategori, egne priser pr. model, sæsonpriser og en forhåndsvisning) og ekstraudstyr på `/admin/extras`. Ændringer gælder kun nye bookinger.
- Efter aflevering afregnes bookingen (`/admin/bookings/[ref]/settle`): forslag til tillæg for ekstra km, brændstof og for sen aflevering, som kan rettes; nye skader kræver en leder, der vælger ansvar og beløb. Tillæggene trækkes fra depositummet, og resten frigives (kort) eller betales tilbage kontant. Satserne er et forslag i `feeRates` (`src/config/rental.ts`) og vises på bilsiden under "Ikke inkluderet".
- Bilsiden viser bilens skader (kan markeres som udbedret) og dens udleveringer og afleveringer. Ledere kan uploade billeder til katalogmodeller; det første vises i kataloget.
- Filer går gennem `StorageProvider` (`src/server/storage`). Uden `STORAGE_*` gemmes de i `.storage/` (kun `APP_ENV=local`). I drift bruges en S3-kompatibel storage (Cloudflare R2 eller AWS S3 i EU) med en privat og en offentlig bucket; nøglerne sættes som miljøvariabler hos hostingen.
- Alle fotos gemmes igen som WebP uden metadata (GPS-position, kamera og tidspunkt fjernes) med `sharp`. Inspektions- og skadefotos er private og vises kun i admin via `/admin/files/[id]` efter adgangstjek; bilbilleder vises via `/media/…`.

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
pnpm build && pnpm db:seed && pnpm test:e2e   # Playwright: mobil + desktop, RTL, tilgængelighed (axe)
```

E2E-testene for de offentlige sider bruger demo-data fra `pnpm db:seed`.

E2E-tests kræver Chromium (`pnpm exec playwright install chromium`). Har du allerede en Chromium, kan du pege på den med `PLAYWRIGHT_CHROMIUM_PATH`.

## Branches

- `main` er produktion.
- `development` er staging, og feature-branches merges hertil via PR.
- CI (lint, format, typecheck, migrationer, tests, build) skal være grøn før merge.

## Deployment

Planen er Vercel (region `fra1`) med Postgres hos Neon i EU. Production deployes fra `main`, staging fra `development`, og hver PR får et preview-miljø. Migrationer køres med `pnpm db:deploy` før en ny version går live. Appen bygges som `standalone`, så den også kan køre i en Docker-container.

Hvert miljø skal have sit eget `AUTH_SECRET` og et `AUTH_URL`, der er præcis den adresse, siden åbnes på. Ellers afviser login-API'et kaldene (CSRF-beskyttelse), og links i e-mails peger forkert. Rate limiting af login læser klientens IP fra `x-forwarded-for`, som Vercel sætter; kører appen bag en anden proxy, skal den sætte headeren.

Cron-jobbet `/api/cron/expire-reservations` skal sættes op til at køre hvert minut med `CRON_SECRET` (mindst 16 tegn, forskellig pr. miljø).

Se [02-tech-stack.md](docs/architecture/02-tech-stack.md#hosting--deployment) for backup og miljøer.
