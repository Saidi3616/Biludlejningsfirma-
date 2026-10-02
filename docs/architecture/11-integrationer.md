# K — Tredjepartsintegrationer

| Integration | Leverandør (anbefalet) | Formål | MVP? | Kræver fra virksomheden | Udskiftelig via |
|---|---|---|---|---|---|
| Betaling | **Stripe** | Kort, MobilePay, Apple Pay, Google Pay, refunderinger, depositum-hold, betalingslinks | MVP | Stripe-konto (CVR, bankkonto, ejeroplysninger), aktivering af MobilePay i Stripe, Apple Pay domæneverifikation | `PaymentProvider` (alternativ: Quickpay, Nets Easy, Adyen) |
| E-mail (transaktionel) | **Resend** | Bekræftelser, påmindelser, password reset | MVP | Eget domæne + DNS-adgang (SPF, DKIM, DMARC) | `MessageChannel` (Postmark, SendGrid, AWS SES) |
| WhatsApp click-to-chat | wa.me-links | Knapper på hele sitet med forudfyldt tekst | MVP | WhatsApp Business-nummer | – |
| WhatsApp Business API | **Meta WhatsApp Cloud API** | Automatiske beskeder (bekræftelse, påmindelser) | MVP (aktiveres når godkendt) | Meta Business-verifikation, dedikeret nummer, godkendte beskedskabeloner pr. sprog, opt-in fra kunden | `MessageChannel` (Twilio, 360dialog) |
| SMS | GatewayAPI (DK) / Twilio | Fallback-kanal | PHASE 2 | Konto, afsendernavn | `MessageChannel` |
| Kort | **Google Maps Platform** | Kortvisning (kontakt/lokationer), Places Autocomplete + Distance Matrix til leveringsgebyr | MVP | Google Cloud-konto + fakturering | `MapsProvider` (Mapbox) |
| Fil-storage | **Cloudflare R2** (EU) / AWS S3 | Bilbilleder (offentligt), kontrakter, inspektionsfotos, kørekort (privat) | MVP | – (vi opretter) | `StorageProvider` |
| Billed-CDN | Vercel Image Optimization / Cloudflare | Responsive billeder, AVIF/WebP | MVP | – | |
| Database | **Neon** (EU) | Managed Postgres, branching pr. PR, PITR | MVP | Betalt plan til produktion | Enhver Postgres |
| Hosting | **Vercel** (fra1) | App, API, cron | MVP | Pro-plan (kommerciel brug) | Docker-container |
| Fejlmonitorering | **Sentry** (EU) | Fejl og performance | MVP | – | |
| Rate limiting | **Upstash Redis** (EU) | Beskyttelse mod misbrug | MVP | – | |
| Bot-beskyttelse | **Cloudflare Turnstile** | Kontaktformular, register | MVP | – | |
| Analytics | **Plausible** (EU, cookiefri) | Trafik og konvertering uden cookie-banner-krav | MVP | Beslutning om analytics | |
| Valutakurser | Danmarks Nationalbank (gratis XML) / exchangerate.host | Visning i EUR/GBP/MAD | MVP (kun visning) | Beslutning om valutapolitik | |
| Kalender | `.ics`-fil | "Tilføj til kalender" | MVP | – | |
| Anmeldelser (ekstern) | Google Business Profile / Trustpilot | Visning/indsamling | PHASE 2 | Eksisterende profiler? | |
| Kørekort/ID-verifikation | Veriff / Onfido | Automatisk kontrol | PHASE 2 | Budget, juridisk afklaring | |
| Digital signatur (avanceret) | MitID Erhverv / Penneo | Kvalificeret signatur | PHASE 2 | Aftale | MVP bruger simpel elektronisk signatur |
| Regnskab | e-conomic / Dinero / Billy | Eksport af betalinger og fakturaer | PHASE 2 | Hvilket system bruges i dag? | |
| AI | Anthropic Claude API | AI-assistent | PHASE 2 | Budget, godkendelse af tone/politik | |

## Bemærkninger

- **MobilePay via Stripe:** Stripe understøtter MobilePay for danske og finske virksomheder. MobilePay understøtter dog ikke reservationer (depositum-hold) på samme måde som kort → depositum kræver kort. Se [K6](13-konflikter.md#k6-depositum).
- **WhatsApp-godkendelse tager tid** (dage til uger). Ansøgning bør startes nu, parallelt med udviklingen. Indtil da sendes automatiske beskeder pr. e-mail, og WhatsApp bruges via click-to-chat.
- **Databehandleraftaler (DPA):** skal indgås med alle leverandører, der behandler persondata (Stripe, Resend, Meta, Neon, Vercel, Sentry, Cloudflare, Google). Alle ovenstående tilbyder standard-DPA og EU-hosting.
