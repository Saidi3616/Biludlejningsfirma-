# C — Database ERD

PostgreSQL, styret af Prisma-migrationer. Alle tabeller har `id` (UUID v7 / cuid2), `created_at`, `updated_at`. Penge er altid `*_minor INT` + `currency CHAR(3)`. Tidspunkter er `timestamptz` (UTC i databasen, vises i lokationens tidszone).

## Vigtigste designvalg

1. **`CarModel` (katalog) og `Car` (fysisk køretøj) er adskilt.** Kunden vælger fx "Toyota Corolla Automatic" i kataloget; systemet tildeler et konkret ledigt køretøj inde i booking-transaktionen. Hvis flåden kun har én af hver, fungerer det identisk med at booke en specifik bil. Se [K5](13-konflikter.md#k5-booking-af-specifik-bil-eller-biltype).
2. **`User` (login) og `Customer` (lejer) er adskilt.** En gæst kan booke uden konto (Customer uden User). Medarbejdere er Users uden Customer.
3. **Bookingens priser er snapshots** i `BookingItem`. Ændrer admin prisen i morgen, er gamle bookinger uændrede.
4. **Bil-status gemmer kun den operationelle tilstand** (`ACTIVE`, `MAINTENANCE`, …). "Reserved" og "Rented" udledes af bookinger på et givent tidspunkt. Se [K2](13-konflikter.md#k2-bilstatus-to-forskellige-lister).
5. **Intet hard delete** af biler, kunder, bookinger eller betalinger. Deaktivering (`is_active`/`archived_at`) og ved GDPR-sletning: anonymisering.

## ERD

```mermaid
erDiagram
  USER ||--o| CUSTOMER : "kan være"
  USER ||--o{ SESSION : har
  USER ||--o{ AUDIT_LOG : udfører

  CUSTOMER ||--o{ BOOKING : laver
  CUSTOMER ||--o{ CONSENT : giver
  CUSTOMER ||--o{ DOCUMENT : ejer
  CUSTOMER ||--o{ REVIEW : skriver
  CUSTOMER ||--o{ MESSAGE : "kommunikation"

  LOCATION ||--o{ OPENING_HOURS : har
  LOCATION ||--o{ DELIVERY_ZONE : har
  LOCATION ||--o{ CAR : "hjemsted"
  LOCATION ||--o{ BOOKING : "afhentning"
  LOCATION ||--o{ BOOKING : "aflevering"

  CAR_CATEGORY ||--o{ CAR_MODEL : indeholder
  CAR_CATEGORY ||--o{ PRICING_RULE : "pris for"
  CAR_MODEL ||--o{ PRICING_RULE : "override"
  CAR_MODEL ||--o{ CAR : "fysiske biler"
  CAR_MODEL ||--o{ CAR_IMAGE : billeder

  CAR ||--o{ BOOKING : "tildelt"
  CAR ||--o{ INSPECTION : har
  CAR ||--o{ DAMAGE : har
  CAR ||--o{ MAINTENANCE : har
  CAR ||--o{ DOCUMENT : "forsikring/syn"

  BOOKING ||--|{ BOOKING_ITEM : linjer
  BOOKING ||--o{ PAYMENT : betalinger
  BOOKING ||--o{ BOOKING_STATUS_EVENT : historik
  BOOKING ||--o{ INSPECTION : "pickup/return"
  BOOKING ||--o| CONTRACT : kontrakt
  BOOKING ||--o{ NOTIFICATION : udsendelser
  BOOKING ||--o| REVIEW : anmeldelse
  BOOKING }o--o| DISCOUNT : "bruger"

  EXTRA ||--o{ BOOKING_ITEM : "som linje"
  DISCOUNT ||--o{ DISCOUNT_REDEMPTION : brug
  BOOKING ||--o| DISCOUNT_REDEMPTION : ""

  INSPECTION ||--o{ DAMAGE : "registrerer"
  INSPECTION ||--o{ DOCUMENT : billeder
  DAMAGE ||--o{ DOCUMENT : billeder
  CONTRACT ||--o| DOCUMENT : "PDF"

  PAYMENT ||--o{ PAYMENT : "refund af"
  CUSTOMER ||--o{ NOTIFICATION : modtager

  USER {
    uuid id PK
    string email UK
    string password_hash
    enum role "SUPER_ADMIN|MANAGER|STAFF|CUSTOMER"
    bool email_verified
    bool two_factor_enabled
    timestamptz last_login_at
    timestamptz disabled_at
  }
  CUSTOMER {
    uuid id PK
    uuid user_id FK "nullable (gæst)"
    string first_name
    string last_name
    string email
    string phone_e164
    string address_line
    string postal_code
    string city
    string country
    date date_of_birth
    string license_number "krypteret"
    string license_country
    date license_issued_at
    date license_expires_at
    string preferred_locale
    timestamptz anonymized_at
  }
  LOCATION {
    uuid id PK
    string slug UK
    string name
    enum type "OFFICE|AIRPORT|PARTNER"
    string address
    decimal lat
    decimal lng
    string timezone
    string phone
    string whatsapp
    bool delivery_enabled
    bool is_active
  }
  OPENING_HOURS {
    uuid id PK
    uuid location_id FK
    int weekday
    time opens_at
    time closes_at
    date special_date "nullable (helligdage)"
    bool closed
  }
  DELIVERY_ZONE {
    uuid id PK
    uuid location_id FK
    int max_distance_km
    int fee_minor
    string currency
  }
  CAR_CATEGORY {
    uuid id PK
    string slug UK "economy, suv, family, luxury, electric"
    jsonb name_i18n
    int sort_order
  }
  CAR_MODEL {
    uuid id PK
    uuid category_id FK
    string slug UK
    string brand
    string model
    int year
    enum transmission "MANUAL|AUTOMATIC"
    enum fuel "PETROL|DIESEL|HYBRID|ELECTRIC"
    int seats
    int bags
    int doors
    bool air_conditioning
    int included_km_per_day
    int extra_km_fee_minor
    int deposit_minor
    jsonb description_i18n
    int popularity_score
    bool is_featured
    bool is_active
  }
  CAR_IMAGE {
    uuid id PK
    uuid car_model_id FK
    string storage_key
    jsonb alt_i18n
    int sort_order
  }
  CAR {
    uuid id PK
    uuid car_model_id FK
    uuid home_location_id FK
    string registration_number UK
    string vin UK
    string color
    int odometer_km
    enum fuel_level "0-8 (ottendedele)"
    enum op_status "ACTIVE|MAINTENANCE|INSPECTION|OUT_OF_SERVICE|RETIRED"
    date purchase_date
    int purchase_price_minor
    string insurance_policy
    date insurance_expires_at
    date next_inspection_due "syn"
    date next_service_due
    int next_service_km
    string tyre_type "sommer/vinter/helår"
  }
  PRICING_RULE {
    uuid id PK
    uuid category_id FK
    uuid car_model_id FK "nullable override"
    int min_days
    int price_minor "total for min_days"
    int per_day_minor "pr. dag i denne trappe"
    string currency
    date valid_from
    date valid_to
    int priority
  }
  BOOKING {
    uuid id PK
    string reference UK "fx BK-7Q4F2"
    uuid customer_id FK
    uuid car_model_id FK
    uuid car_id FK
    uuid pickup_location_id FK
    uuid return_location_id FK
    timestamptz pickup_at
    timestamptz return_at
    tstzrange blocked_range "inkl. buffer"
    enum status "PENDING_PAYMENT|CONFIRMED|ACTIVE|COMPLETED|CANCELLED|EXPIRED|NO_SHOW"
    enum payment_status "UNPAID|PAID|PARTIALLY_REFUNDED|REFUNDED|FAILED"
    enum deposit_status "NOT_REQUIRED|PENDING|HELD|CAPTURED|RELEASED"
    enum fulfilment "PICKUP|DELIVERY"
    string delivery_address
    int subtotal_minor
    int discount_minor
    int total_minor
    int deposit_minor
    string currency
    string locale
    string manage_token_hash "gæsteadgang"
    timestamptz expires_at
    uuid discount_id FK
  }
  BOOKING_ITEM {
    uuid id PK
    uuid booking_id FK
    enum type "RENTAL|EXTRA|DELIVERY_FEE|FEE|DISCOUNT|EXTRA_KM|LATE_FEE|DAMAGE"
    uuid extra_id FK "nullable"
    string label_snapshot
    int quantity
    int unit_price_minor
    int total_minor
    string currency
  }
  BOOKING_STATUS_EVENT {
    uuid id PK
    uuid booking_id FK
    string from_status
    string to_status
    uuid actor_user_id FK
    string reason
  }
  EXTRA {
    uuid id PK
    string code UK "child_seat, gps, ..."
    jsonb name_i18n
    jsonb description_i18n
    enum pricing "PER_DAY|PER_BOOKING"
    int price_minor
    int max_price_minor "loft"
    string currency
    int max_quantity
    int stock "nullable"
    bool is_active
  }
  PAYMENT {
    uuid id PK
    uuid booking_id FK
    uuid parent_payment_id FK "ved refund"
    enum kind "CHARGE|DEPOSIT_HOLD|DEPOSIT_CAPTURE|REFUND|MANUAL"
    enum status "PENDING|REQUIRES_ACTION|SUCCEEDED|FAILED|CANCELLED"
    enum method "CARD|MOBILEPAY|APPLE_PAY|GOOGLE_PAY|CASH|BANK_TRANSFER"
    int amount_minor
    string currency
    string provider "stripe"
    string provider_ref UK "pi_..., re_..."
    string failure_code
    uuid recorded_by_user_id FK "manuel"
  }
  PROCESSED_WEBHOOK {
    string provider_event_id PK
    string provider
    timestamptz processed_at
  }
  DISCOUNT {
    uuid id PK
    string code UK
    enum type "PERCENT|FIXED"
    int value "procent eller minor"
    string currency
    date valid_from
    date valid_to
    int min_booking_minor
    int min_days
    int max_uses
    int max_uses_per_customer
    uuid_array category_ids
    uuid_array car_model_ids
    bool is_active
  }
  DISCOUNT_REDEMPTION {
    uuid id PK
    uuid discount_id FK
    uuid booking_id FK
    uuid customer_id FK
    int amount_minor
  }
  INSPECTION {
    uuid id PK
    uuid booking_id FK
    uuid car_id FK
    enum type "PICKUP|RETURN"
    int odometer_km
    int fuel_level
    string notes
    uuid performed_by_user_id FK
    timestamptz performed_at
    string customer_signature_key
  }
  DAMAGE {
    uuid id PK
    uuid car_id FK
    uuid detected_in_inspection_id FK
    uuid booking_id FK "nullable"
    string area "fx front-venstre"
    enum severity "MINOR|MODERATE|MAJOR"
    enum origin "EXISTING|NEW"
    enum liability "CUSTOMER|INTERNAL|THIRD_PARTY|UNDECIDED"
    string description
    int estimated_cost_minor
    timestamptz repaired_at
  }
  MAINTENANCE {
    uuid id PK
    uuid car_id FK
    enum type "SERVICE|INSPECTION_SYN|TYRES|REPAIR|CLEANING"
    timestamptz starts_at
    timestamptz ends_at
    tstzrange blocked_range
    int odometer_km
    int cost_minor
    string vendor
    string notes
    enum status "PLANNED|IN_PROGRESS|DONE"
  }
  CONTRACT {
    uuid id PK
    uuid booking_id FK
    int version
    jsonb terms_snapshot
    string signer_name
    timestamptz signed_at
    string signed_ip_hash
    string signature_storage_key
    uuid pdf_document_id FK
  }
  DOCUMENT {
    uuid id PK
    enum owner_type "CUSTOMER|CAR|BOOKING|INSPECTION|DAMAGE|CONTRACT"
    uuid owner_id
    enum kind "LICENSE|ID|CONTRACT_PDF|INVOICE|PHOTO|INSURANCE|OTHER"
    string storage_key "privat bucket"
    string mime_type
    int size_bytes
    string sha256
    enum visibility "PRIVATE|CUSTOMER_VISIBLE"
    timestamptz delete_after
  }
  MESSAGE {
    uuid id PK
    uuid customer_id FK "nullable"
    uuid booking_id FK "nullable"
    enum direction "INBOUND|OUTBOUND"
    enum channel "CONTACT_FORM|EMAIL|WHATSAPP|SMS|PHONE_NOTE"
    string name
    string email
    string phone
    string subject
    string body
    enum status "NEW|IN_PROGRESS|ANSWERED|CLOSED"
    uuid assigned_user_id FK
  }
  NOTIFICATION {
    uuid id PK
    uuid booking_id FK
    uuid customer_id FK
    string template "BOOKING_RECEIVED, PAYMENT_RECEIVED, ..."
    enum channel "EMAIL|WHATSAPP|SMS"
    string locale
    jsonb payload
    timestamptz scheduled_at
    enum status "PENDING|SENDING|SENT|FAILED|SKIPPED"
    int attempts
    timestamptz next_attempt_at
    string provider_message_id
    string last_error
    string dedupe_key UK
  }
  REVIEW {
    uuid id PK
    uuid booking_id FK UK
    uuid customer_id FK
    int rating "1-5"
    string comment
    string display_name
    enum status "PENDING|PUBLISHED|HIDDEN"
  }
  CONSENT {
    uuid id PK
    uuid customer_id FK "nullable"
    string anonymous_id "cookie-samtykke"
    enum purpose "NECESSARY|ANALYTICS|MARKETING|WHATSAPP_MARKETING|TERMS|PRIVACY"
    bool granted
    string policy_version
    string source
  }
  AUDIT_LOG {
    uuid id PK
    uuid actor_user_id FK
    string action "booking.cancel, car.price.update, ..."
    string entity_type
    uuid entity_id
    jsonb diff "uden følsomme felter"
    string ip_hash
    string request_id
  }
  EXCHANGE_RATE {
    uuid id PK
    string base "DKK"
    string quote "EUR|GBP|MAD"
    decimal rate
    timestamptz fetched_at
  }
  SESSION {
    uuid id PK
    uuid user_id FK
    string token_hash
    timestamptz expires_at
  }
```

## Constraints og indekser, der bærer forretningslogik

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1) Ingen dobbeltbooking af samme fysiske bil
ALTER TABLE booking ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (car_id WITH =, blocked_range WITH &&)
  WHERE (status IN ('PENDING_PAYMENT','CONFIRMED','ACTIVE'));

-- 2) Service/vedligehold blokerer også bilen
--    (tjekkes i availability-service + trigger, da to tabeller ikke kan dele én EXCLUDE)
--    Maintenance har sin egen EXCLUDE pr. bil.

-- 3) Datoer skal give mening
ALTER TABLE booking ADD CONSTRAINT booking_dates_valid CHECK (return_at > pickup_at);

-- 4) Én anmeldelse pr. booking, én kontrakt-version pr. booking
-- 5) Unikke koder: discount.code (case-insensitive via citext), booking.reference, car.registration_number, car.vin
-- 6) Indekser: booking(status, pickup_at), booking(customer_id), notification(status, next_attempt_at),
--    car(car_model_id, op_status), message(status, created_at)
```

`blocked_range = tstzrange(pickup_at - buffer_before, return_at + buffer_after)` — bufferen (fx 2 timer til rengøring og klargøring) er en indstilling pr. lokation.

> **Implementeringsnote (M2).** I koden gemmes intervallet som to kolonner, `blockedFrom` og `blockedUntil`, og constraintet bruger udtrykket `tstzrange("blockedFrom", "blockedUntil", '[)')`. Det undgår en kolonnetype, Prisma ikke understøtter. Overlap mellem booking og vedligehold håndhæves af triggere med en advisory lock pr. bil, så samtidige transaktioner ikke begge kan slippe igennem. Rabatkoder gemmes med store bogstaver (CHECK) i stedet for `citext`. Tabel- og kolonnenavne følger Prismas standard (`"Booking"."carId"`). Den præcise SQL ligger i `prisma/migrations/*_booking_constraints/migration.sql` og er dækket af `tests/integration/booking-constraints.test.ts`.

> **Implementeringsnote (M3).** Login-tabellerne følger Better Auths skema: `Session`, `Account` (password som scrypt-hash i `Account.password` med `providerId = "credential"`, ikke i `User`), `Verification` (engangstokens), `TwoFactor` (TOTP-hemmelighed og backupkoder, krypteret med `AUTH_SECRET`) og `RateLimit`. `User` har fået `locale`, så e-mails sendes på brugerens sprog. E-mails gemmes med små bogstaver (CHECK `user_email_lowercase`). Se `prisma/migrations/*_auth*`.

> **Implementeringsnote (M5).** `Booking` har fået `idempotencyKey` (unik), så `POST /bookings` med samme Idempotency-Key giver den samme booking, og et indeks på `(status, expiresAt)` til udløbsjobbet. `blockedFrom` = afhentning minus afhentningsstedets `bufferBeforeMinutes`; `blockedUntil` = aflevering plus afleveringsstedets `bufferAfterMinutes`. Se `prisma/migrations/*_booking_engine`.

### Tildeling af fysisk bil (inde i én transaktion)

1. Find biler af den valgte `CarModel` på afhentningslokationen med `op_status = 'ACTIVE'`, uden overlappende booking eller vedligehold.
2. Sortér (fx laveste kilometer først, eller den bil der står ledig kortest — så flåden udnyttes jævnt).
3. `INSERT` booking med `car_id`. Rammer vi exclusion-constraintet (en anden kunde nåede først), prøv næste bil. Ingen ledige → fejl `CAR_NO_LONGER_AVAILABLE`.

## Følsomme data

| Felt | Beskyttelse |
|---|---|
| `password_hash` | Argon2id/scrypt (via auth-bibliotek), aldrig logget |
| `license_number`, `date_of_birth` | Kolonne-krypteret (AES-256-GCM, nøgle i env), dekrypteres kun for STAFF+ |
| Kørekort-/ID-billeder | Privat bucket, signerede URL'er (5 min), slettes automatisk efter `delete_after` |
| Kortdata | Gemmes aldrig. Vi gemmer kun Stripe-referencer og evt. kortets brand + sidste 4 cifre |
| `AUDIT_LOG.diff` | Følsomme felter filtreres fra før skrivning |
| IP-adresser | Gemmes hashet med salt |

## Mapping til master prompt §34

| Krævet entity | Tabel |
|---|---|
| User | `USER` (+ `SESSION`) |
| Customer | `CUSTOMER` |
| Car | `CAR_MODEL` (katalog) + `CAR` (fysisk) + `CAR_IMAGE` |
| CarCategory | `CAR_CATEGORY` |
| Location | `LOCATION` + `OPENING_HOURS` + `DELIVERY_ZONE` |
| Booking / BookingItem | `BOOKING` + `BOOKING_ITEM` + `BOOKING_STATUS_EVENT` |
| Payment | `PAYMENT` + `PROCESSED_WEBHOOK` |
| PricingRule | `PRICING_RULE` |
| Extra | `EXTRA` |
| Discount | `DISCOUNT` + `DISCOUNT_REDEMPTION` |
| Damage / Inspection / Maintenance | `DAMAGE` / `INSPECTION` / `MAINTENANCE` |
| Document | `DOCUMENT` (+ `CONTRACT`) |
| Message | `MESSAGE` (kontaktformular + kommunikationslog) |
| Review | `REVIEW` |
| Notification | `NOTIFICATION` (outbox) |
| AuditLog | `AUDIT_LOG` |
| Consent | `CONSENT` |
