# Lanceringstjekliste (M17)

Alt i koden er klar og testet ([acceptkriterier](qa/acceptkriterier.md)). Det, der står tilbage, kræver virksomhedens konti, oplysninger eller beslutninger. Rækkefølgen er den, det skal ske i.

Nøgler og hemmeligheder sættes **kun** i hostingens miljøvariabler (Vercel → Project → Settings → Environment Variables), aldrig i chat, e-mail eller git.

## 1. Oplysninger fra virksomheden

Se [14-manglende-info.md](architecture/14-manglende-info.md). Før launch skal mindst disse være på plads:

- [ ] Firmanavn, logo, CVR, adresse, telefon, e-mail og WhatsApp-nummer (`src/config/site.ts`, logo via `scripts/generate-icons.mjs`)
- [ ] Lokationer med åbningstider, flåde (biler og modeller), prisliste, depositum, km, ekstraudstyr og leveringszoner (lægges ind i admin)
- [ ] Gebyrer for brændstof, forsinkelse og afbestilling (`src/config/rental.ts`, `feeRates` er pladsholdere)
- [ ] Lejebetingelser, privatlivspolitik og cookiepolitik godkendt af en jurist (teksterne i `messages/*.json` er udkast)
- [ ] Hvor længe kontrakter gemmes efter sletning af en kunde (foreløbig 5 år)
- [ ] Hvilke sprog der skal være klar; arabisk og fransk tekst godkendt af en, der taler sproget

## 2. Konti, der skal oprettes

- [ ] **Neon** (Postgres, EU/Frankfurt): én database til production og én til staging. `DATABASE_URL`.
- [ ] **Vercel**: projektet er forbundet. Production fra `main`, staging fra `development` (region `fra1`).
- [ ] **Stripe**: konto med CVR og bank, MobilePay aktiveret. `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` og webhook til `https://<domæne>/api/webhooks/stripe` med `payment_intent.succeeded`, `payment_intent.payment_failed` og `payment_intent.amount_capturable_updated`; dens secret i `STRIPE_WEBHOOK_SECRET`. Test først med testnøgler på staging.
- [ ] **Cloudflare R2** (EU) eller AWS S3: én privat og én offentlig bucket. `STORAGE_*`.
- [ ] **E-mail** (Resend, EU): domænet verificeret (SPF/DKIM). `EMAIL_API_KEY`, `EMAIL_FROM`.
- [ ] **Sentry** (EU): `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`.
- [ ] **WhatsApp Business API** (Meta): godkendte skabeloner. `WHATSAPP_*`. Kan komme efter launch; WhatsApp-knappen virker uden.
- [ ] **Upstash Redis** (valgfri): rate limiting på tværs af instanser.

## 3. Miljøvariabler pr. miljø (staging og production hver for sig)

- [ ] `APP_ENV` = `staging` eller `production`, og `NEXT_PUBLIC_APP_ENV` det samme
- [ ] `AUTH_URL` og `NEXT_PUBLIC_SITE_URL` = præcis adressen, siden åbnes på (skal også være sat under build)
- [ ] `AUTH_SECRET`: `openssl rand -base64 32`
- [ ] `FIELD_ENCRYPTION_KEY`: `openssl rand -base64 32` (må aldrig skiftes bagefter uden genkryptering)
- [ ] `CRON_SECRET`: mindst 16 tegn
- [ ] `FAKE_PAYMENTS` må **ikke** være sat
- [ ] `NEXT_PUBLIC_WHATSAPP_NUMBER`

## 4. Database

- [ ] `pnpm db:deploy` mod production-databasen (migrationer)
- [ ] Opret den første SUPER_ADMIN, og slå 2FA til ved første login
- [ ] Læg lokationer, kategorier, modeller, biler, priser og ekstraudstyr ind i admin (kør **ikke** demo-seed i production)
- [ ] Backup: Neon point-in-time recovery slået til, og et dagligt dump til en separat EU-bucket
- [ ] Restore-test: opret en Neon-gren fra et tidspunkt, og kør `scripts/restore-test.sh` mod en tom database

## 5. Cron-jobs

Med `Authorization: Bearer <CRON_SECRET>`:

- [ ] `/api/cron/expire-reservations` hvert minut
- [ ] `/api/cron/notifications` hvert minut
- [ ] `/api/cron/retention` dagligt

## 6. Domæne og DNS

- [ ] Domænet peger på Vercel (production), og staging har sit eget underdomæne
- [ ] HTTPS virker, og `http://` sender videre til `https://`
- [ ] E-maildomænet har SPF, DKIM og DMARC

## 7. Test på staging (før production)

- [ ] `pnpm test:e2e` mod en kopi af staging-opsætningen er grøn (CI kører den på hver PR)
- [ ] En rigtig booking med Stripe **test**kort: betaling, bekræftelse på e-mail, depositum ved udlevering, aflevering og afregning
- [ ] Refusion og annullering med testkort
- [ ] Upload af inspektionsfotos og hentning af kontrakt-PDF (privat storage)
- [ ] `node scripts/load-test.mjs https://<staging> 10 30` giver ingen fejl
- [ ] Headers: securityheaders.com giver A, og CSP blokerer ikke Stripe
- [ ] Google Rich Results Test på en bil-, lokations- og FAQ-side
- [ ] Lighthouse mobil ≥ 90 på forside, katalog og bil-side
- [ ] Gennemgang på en rigtig telefon (iPhone og Android), også på arabisk
- [ ] Skærmlæser (VoiceOver eller TalkBack) gennem søgning og booking

## 8. Go-live

- [ ] Merge `development` → `main` (kræver ejerens ja)
- [ ] Skift Stripe til live-nøgler i production og opret live-webhooken
- [ ] Én rigtig booking med et rigtigt kort, refundér den bagefter
- [ ] Tilmeld sitemap i Google Search Console: `https://<domæne>/sitemap.xml`
- [ ] Hold øje med Sentry og Stripe-dashboardet det første døgn
