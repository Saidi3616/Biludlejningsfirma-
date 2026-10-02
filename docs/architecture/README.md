# Arkitektur — Biludlejningsplatform

Status: **Udkast til godkendelse.** Ingen applikationskode er skrevet endnu (jf. master prompt §56).

Dette er leverancen for §56 / START i master prompten. Læs dokumenterne i rækkefølge, men hvis du kun har tid til tre, så læs:

1. [13 — Konflikter i kravene](13-konflikter.md) — beslutninger, der skal tages før kode.
2. [14 — Manglende information](14-manglende-info.md) — hvad virksomheden skal levere.
3. [10 — Milestones](10-milestones.md) — hvad MVP er, og hvad der er PHASE 2.

| # | Dokument | Indhold |
|---|----------|---------|
| A | [01 — Systemarkitektur](01-systemarkitektur.md) | Lag, moduler, dataflow, kritiske designbeslutninger |
| B | [02 — Tech-stack](02-tech-stack.md) | Valgt stack med begrundelse og fravalg |
| C | [03 — Database ERD](03-database-erd.md) | Entiteter, relationer, constraints, dobbeltbooking-beskyttelse |
| D | [04 — Sitemap](04-sitemap.md) | Offentlige sider, konto, admin, i18n-ruter |
| E | [05 — User flows](05-user-flows.md) | Kundens rejser fra søgning til anmeldelse |
| F | [06 — Admin flows](06-admin-flows.md) | Medarbejderens daglige arbejdsgange |
| G | [07 — API-struktur](07-api.md) | REST v1, auth, fejlformat, webhooks, cron |
| H | [08 — Komponentstruktur](08-komponenter.md) | Designsystem og feature-komponenter |
| I | [09 — Mappestruktur](09-mappestruktur.md) | Repository-layout |
| J | [10 — Milestones](10-milestones.md) | Små milestones, MVP vs PHASE 2 |
| K | [11 — Tredjepartsintegrationer](11-integrationer.md) | Betaling, beskeder, kort, storage, monitorering |
| L | [12 — Tekniske risici](12-risici.md) | Risici og afbødning |
| – | [13 — Konflikter i kravene](13-konflikter.md) | §57: konflikt, forklaring, anbefalet løsning |
| M | [14 — Manglende information](14-manglende-info.md) | Spørgsmål til virksomheden |

## Kort fortalt

- **Én Next.js-applikation (modulær monolit)** i TypeScript med et tydeligt servicelag. Al booking-, pris- og betalingslogik ligger på serveren — aldrig i UI.
- **PostgreSQL** med en database-constraint (`EXCLUDE USING gist`), der gør dobbeltbooking fysisk umulig, også ved samtidige forsøg.
- **Stripe** til betaling (kort, MobilePay, Apple Pay, Google Pay). Ingen kortdata i vores database.
- **Notifikationer via en outbox-tabel**: en booking bliver aldrig ødelagt af, at e-mail eller WhatsApp fejler.
- **Versioneret REST API (`/api/v1`)** ovenpå samme services, så iOS/Android-apps og en AI-assistent senere kan bruge præcis samme regler.
- **EU-hosting** (Vercel `fra1` + Postgres i EU + privat S3-kompatibel storage) af hensyn til GDPR.
