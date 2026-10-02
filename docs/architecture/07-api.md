# G — API-struktur

## Principper

- **REST, versioneret:** `/api/v1/...`. Bruges af mobilapps, AI-assistent, tredjeparter og af klient-komponenter i web-appen. Server Components kalder services direkte (samme logik, ingen ekstra netværkshop).
- **JSON**, `camelCase`, datoer i ISO 8601 med tidszone, penge som `{ "amountMinor": 39900, "currency": "DKK" }`.
- **Validering:** hvert endpoint har et Zod-skema for params, query og body. Ukendte felter afvises.
- **Auth:** session-cookie (`HttpOnly`, `Secure`, `SameSite=Lax`) for web; `Authorization: Bearer` for mobilapp (PHASE 2).
- **CSRF:** mutationer fra browser kræver same-origin (Origin-header tjek) + SameSite-cookies; Server Actions har indbygget beskyttelse.
- **Rate limiting** pr. IP og pr. bruger på alle offentlige mutationer og søgninger.
- **Idempotency-Key** understøttes på `POST /bookings` og `POST /payments/*`.
- **Pagination:** cursor-baseret (`?cursor=...&limit=20`).
- **OpenAPI-spec genereres fra Zod-skemaerne** (`zod-to-openapi`) → dokumentation til mobil-/AI-udvikling.

## Fejlformat

```json
{
  "error": {
    "code": "CAR_NO_LONGER_AVAILABLE",
    "message": "Bilen blev netop booket af en anden.",
    "details": { "alternatives": ["toyota-corolla-auto", "vw-golf-auto"] },
    "requestId": "req_01J..."
  }
}
```

Fejlkoder er stabile strenge (fx `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CAR_NO_LONGER_AVAILABLE`, `RESERVATION_EXPIRED`, `DISCOUNT_INVALID`, `OUTSIDE_OPENING_HOURS`, `RATE_LIMITED`). `message` er oversat efter `Accept-Language`.

## Offentlige endpoints

| Metode | Path | Formål |
|---|---|---|
| GET | `/api/v1/locations` | Aktive lokationer, åbningstider, levering tilgængelig |
| GET | `/api/v1/locations/:slug` | Én lokation |
| GET | `/api/v1/categories` | Bilkategorier |
| GET | `/api/v1/cars` | Katalog (modeller). Filtre: `category, brand, transmission, fuel, seatsMin, bagsMin, priceMin, priceMax`. Sortering: `price_asc, price_desc, popular, newest, recommended`. Med `pickupAt/returnAt/pickupLocation` returneres kun ledige + totalpris |
| GET | `/api/v1/cars/:slug` | Model-detaljer, billeder, prisregler, inkluderet km, depositum |
| GET | `/api/v1/availability` | `carModel, pickupLocation, returnLocation, pickupAt, returnAt` → `{ available, nextAvailable[], alternatives[] }` |
| POST | `/api/v1/quotes` | Fuld prisberegning: model, periode, lokationer, ekstraudstyr, levering, rabatkode → linjer + total + depositum. Ingen side-effekter |
| GET | `/api/v1/extras` | Aktivt ekstraudstyr |
| POST | `/api/v1/delivery/quote` | Adresse → leveringsgebyr eller "uden for zone" |
| POST | `/api/v1/discounts/validate` | Tjek rabatkode mod en quote |
| GET | `/api/v1/reviews` | Publicerede anmeldelser |
| POST | `/api/v1/contact` | Kontaktformular (rate-limited, honeypot/Turnstile) |

## Booking og betaling

| Metode | Path | Formål |
|---|---|---|
| POST | `/api/v1/bookings` | Opret reservation (`PENDING_PAYMENT`, 15 min). Body: quote-input + kundeoplysninger + accepteret vilkår-version. Prisen **genberegnes** på serveren — klientens beløb ignoreres |
| GET | `/api/v1/bookings/:reference` | Kræver ejer-session **eller** `?token=` (gæst) **eller** STAFF+ |
| POST | `/api/v1/bookings/:reference/cancel` | Kunde annullerer efter politik |
| POST | `/api/v1/bookings/:reference/payment-intent` | Opret/hent Stripe PaymentIntent → `clientSecret` |
| GET | `/api/v1/bookings/:reference/contract.pdf` | Signeret URL til kontrakt |
| GET | `/api/v1/bookings/:reference/receipt.pdf` | Kvittering |
| POST | `/api/v1/reviews` | Opret anmeldelse (signeret token fra e-mail) |

(Master promptens `POST /api/payments` svarer til `POST /bookings/:reference/payment-intent`; selve bekræftelsen kommer via webhook — klienten kan aldrig selv markere en booking som betalt.)

## Kunde (kræver login, rolle CUSTOMER)

| Metode | Path |
|---|---|
| GET/PATCH | `/api/v1/me` |
| GET | `/api/v1/me/bookings?scope=upcoming\|past` |
| GET | `/api/v1/me/payments` |
| GET/POST | `/api/v1/me/documents` (upload via signeret URL) |
| GET/PUT | `/api/v1/me/consents` |
| POST | `/api/v1/me/export` (GDPR-dataeksport → e-mail med link) |
| POST | `/api/v1/me/delete` (anmodning om sletning/anonymisering) |
| GET/POST/DELETE | `/api/v1/me/saved-cars` — PHASE 2 |

Auth-endpoints (`/api/auth/*`: login, logout, register, verify, reset) leveres af auth-biblioteket.

## Admin (`/api/v1/admin/*` — kræver STAFF+, policy pr. handling)

| Ressource | Endpoints |
|---|---|
| Dashboard | `GET /admin/dashboard?location=&date=` |
| Kalender | `GET /admin/calendar?from=&to=&location=` |
| Bookinger | `GET /admin/bookings`, `POST /admin/bookings`, `GET/PATCH /admin/bookings/:ref`, `POST /admin/bookings/:ref/{confirm,cancel,refund,reschedule,reassign,start,complete,send-message,payment-link}` |
| Betalinger | `POST /admin/bookings/:ref/payments` (manuel registrering), `POST /admin/bookings/:ref/deposit/{hold,capture,release}` |
| Inspektioner | `POST /admin/bookings/:ref/inspections`, `GET /admin/inspections/:id`, `POST /admin/inspections/:id/photos` |
| Skader | `GET /admin/damages`, `POST/PATCH /admin/damages/:id` |
| Kontrakter | `POST /admin/bookings/:ref/contract`, `POST /admin/contracts/:id/sign` |
| Kunder | `GET /admin/customers`, `GET/PATCH /admin/customers/:id`, `POST /admin/customers/:id/{export,anonymize}` |
| Flåde | `CRUD /admin/car-models`, `CRUD /admin/cars`, `POST /admin/cars/:id/{status,odometer}`, `POST /admin/car-models/:id/images` |
| Vedligehold | `CRUD /admin/maintenance` |
| Priser | `CRUD /admin/pricing-rules`, `POST /admin/pricing-rules/preview` |
| Ekstraudstyr | `CRUD /admin/extras` |
| Rabatter | `CRUD /admin/discounts` |
| Lokationer | `CRUD /admin/locations`, `PUT /admin/locations/:id/{hours,delivery-zones}` |
| Beskeder | `GET /admin/messages`, `PATCH /admin/messages/:id`, `POST /admin/messages/:id/reply` |
| Notifikationer | `GET /admin/notifications`, `POST /admin/notifications/:id/retry` |
| Anmeldelser | `GET /admin/reviews`, `PATCH /admin/reviews/:id` |
| Statistik | `GET /admin/stats?from=&to=&location=` |
| Brugere | `CRUD /admin/users` (SUPER_ADMIN) |
| Audit | `GET /admin/audit-log` |

"CRUD" = `GET` liste, `POST` opret, `GET/PATCH` én, `DELETE` = deaktivér (soft delete) hvor data er refereret.

## Webhooks (ingen session; signatur verificeres)

| Path | Kilde | Håndterer |
|---|---|---|
| `POST /api/webhooks/stripe` | Stripe | `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.amount_capturable_updated` (depositum), `charge.refunded`, `charge.dispute.created` |
| `POST /api/webhooks/whatsapp` | Meta | Leveringsstatus, indkommende beskeder → `MESSAGE` |
| `POST /api/webhooks/email` | Resend | Bounce/complaint → markér e-mail ugyldig |

Alle webhooks: verificér signatur → gem event-id i `PROCESSED_WEBHOOK` (idempotens) → behandl i transaktion → svar 200 hurtigt.

## Cron (beskyttet med `CRON_SECRET`)

| Path | Interval | Opgave |
|---|---|---|
| `/api/cron/notifications` | hvert minut | Send pending notifikationer (retry med backoff, maks. 5 forsøg, derefter FAILED + admin-alarm) |
| `/api/cron/expire-reservations` | hvert minut | `PENDING_PAYMENT` med `expires_at < now()` → `EXPIRED`, bil frigives |
| `/api/cron/schedule-reminders` | hvert 15. min | Opret påmindelser (24 t før afhentning, før aflevering, anmeldelsesanmodning) med `dedupe_key` |
| `/api/cron/exchange-rates` | dagligt | Hent valutakurser |
| `/api/cron/retention` | dagligt | Slet dokumenter efter `delete_after`, rydning af gamle sessions |
| `/api/cron/fleet-alerts` | dagligt | Syn, forsikring, service forfalder → admin-notifikation |

## Interne service-interfaces (eksempler)

```ts
// src/server/notifications/notification-service.ts
NotificationService.sendBookingConfirmation(bookingId)
NotificationService.sendPaymentConfirmation(bookingId)
NotificationService.sendCarReady(bookingId)
NotificationService.sendPickupReminder(bookingId)
NotificationService.sendReturnReminder(bookingId)
NotificationService.sendThankYou(bookingId)
NotificationService.sendReviewRequest(bookingId)
// Hver metode skriver NOTIFICATION-rækker (én pr. kanal kunden har) — selve afsendelsen sker i cron.

interface MessageChannel {
  readonly channel: 'EMAIL' | 'WHATSAPP' | 'SMS';
  send(msg: RenderedMessage): Promise<{ providerMessageId: string }>;
}

interface PaymentProvider {
  createPaymentIntent(input): Promise<{ clientSecret: string; providerRef: string }>;
  createDepositHold(input): Promise<...>;
  capture(providerRef, amountMinor): Promise<...>;
  refund(providerRef, amountMinor): Promise<...>;
  verifyWebhook(rawBody, signature): ProviderEvent;
}
```
