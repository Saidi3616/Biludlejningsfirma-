# D — Sitemap

## Sprog i URL

Alle offentlige sider findes på fire sprog. Dansk er standard uden præfiks; øvrige sprog har præfiks:

```
/cars            → dansk
/en/cars         → engelsk
/ar/cars         → arabisk (RTL)
/fr/cars         → fransk
```

Hver side får `hreflang`-links og canonical URL. Se [K11](13-konflikter.md#k11-url-struktur-og-sprog). `/admin` er ikke oversat i URL, men UI'et kan skifte sprog.

## Offentlig hjemmeside

```
/                                Forside (hero + booking-widget, populære biler, hvorfor os, proces, anmeldelser, WhatsApp-CTA)
├── /cars                        Bilkatalog (filtre, sortering, søgeresultat når datoer er valgt)
│   ├── /cars/[slug]             Bil-side (galleri, specs, priser, tilgængelighed, "Book denne bil")
│   └── /cars/category/[slug]    Kategoriside (SEO: "SUV udlejning", "Elbil udlejning")  [MVP: valgfri]
├── /pricing                     Prisoversigt pr. kategori fra databasen + ekstraudstyr + gebyrer
├── /locations                   Alle lokationer (kort, åbningstider)
│   └── /locations/[slug]        Lokationsside (SEO: "Biludlejning Københavns Lufthavn") + LocalBusiness schema
├── /about
├── /contact                     Telefon, WhatsApp, e-mail, adresse, åbningstider, kort, kontaktformular
├── /faq                         FAQ (FAQPage schema)
├── /reviews                     Alle verificerede anmeldelser
├── /terms                       Lejebetingelser (versioneret)
├── /privacy                     Privatlivspolitik
├── /cookies                     Cookiepolitik + "Skift samtykke"
│
├── /booking                     Bookingflow (trin i samme route, state i URL)
│   ├── ?step=extras
│   ├── ?step=details
│   ├── ?step=review
│   └── ?step=payment
├── /booking/confirmation        Bekræftelse (efter betaling; kan genindlæses)
├── /booking/manage/[token]      Gæst: sikkert link fra e-mail → sætter adgang og sender til /booking/[reference]  [tilføjet — se K7]
├── /booking/[reference]         Gæst: se/annullér booking (efter linket eller i samme browser)
├── /booking/[reference]/receipt Kvittering (print/PDF)
│
├── /login
├── /register
├── /forgot-password             [tilføjet — nødvendig for login]
├── /reset-password/[token]      [tilføjet]
│
└── /account                     Min konto (kræver login)
    ├── /account/bookings        Kommende + tidligere
    │   └── /account/bookings/[reference]   Detaljer, kontrakt, kvittering, annullér, WhatsApp
    ├── /account/payments        Betalinger og fakturaer/kvitteringer
    ├── /account/documents       Kontrakter, kørekort (upload)  [M12: kontrakt; upload kræver fillager]
    ├── /account/profile         Profil + kontaktoplysninger + kørekort
    ├── /account/privacy         Samtykker, dataeksport, slet konto  [M15]
    └── /account/saved           Gemte biler  [PHASE 2]
```

Tekniske ruter: `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`, `/offline`.

## Admin

```
/admin                           Dashboard (i dag: afhentninger, afleveringer, aktive, ledige, på service, KPI'er)
├── /admin/calendar              Kalender (dag/uge/måned; pr. bil som tidslinje)
├── /admin/bookings              Liste + filtre
│   ├── /admin/bookings/new      Telefon-/skrankebooking
│   └── /admin/bookings/[ref]    Booking: kunde, bil, betalinger, depositum, kontrakt, inspektioner, beskeder, historik
├── /admin/customers
│   └── /admin/customers/[id]    Profil, bookinger, dokumenter, beskeder, GDPR-handlinger
├── /admin/fleet                 (= "/admin/cars" i master prompt)
│   ├── /admin/fleet/models      Katalog-modeller (billeder, specs, beskrivelse)
│   ├── /admin/fleet/cars        Fysiske biler (reg.nr., VIN, km, status)
│   └── /admin/fleet/cars/[id]   Livscyklus, service, skader, dokumenter, bookinghistorik
├── /admin/inspections/[id]      Pickup-/returtjek (mobilvenlig — bruges på parkeringspladsen)
├── /admin/damages               Skader på tværs af flåden
├── /admin/maintenance           Service, syn, dæk
├── /admin/pricing               Prisregler pr. kategori/model
├── /admin/extras                Ekstraudstyr
├── /admin/discounts             Rabatkoder
├── /admin/locations             Lokationer, åbningstider, leveringszoner
├── /admin/messages              Kontaktforespørgsler og kommunikationslog
├── /admin/notifications         Udsendte/fejlede beskeder, genforsøg
├── /admin/reviews               Moderation
├── /admin/statistics            Statistik med periodefilter
├── /admin/users                 Medarbejdere og roller (SUPER_ADMIN)
├── /admin/audit-log             (SUPER_ADMIN, MANAGER)
└── /admin/settings              Firmaoplysninger, buffer-tider, vilkår-versioner, valutakurser
```

## Adgang pr. rolle

| Område | CUSTOMER | STAFF | MANAGER | SUPER_ADMIN |
|---|:-:|:-:|:-:|:-:|
| /account | ✓ | | | |
| Dashboard, kalender, bookinger, kunder (læs) | | ✓ | ✓ | ✓ |
| Opret/ændr booking, inspektioner, skader, beskeder | | ✓ | ✓ | ✓ |
| Annullér + refundér | | – (kan anmode) | ✓ | ✓ |
| Depositum og afregning efter aflevering | | ✓ | ✓ | ✓ |
| Godkend ansvar og beløb for skader | | | ✓ | ✓ |
| Flåde, service | | læs + status | ✓ | ✓ |
| Priser, ekstraudstyr, rabatter, lokationer | | | ✓ | ✓ |
| Statistik / omsætning | | | ✓ | ✓ |
| Brugere og roller, indstillinger | | | | ✓ |
| Audit log | | | ✓ (læs) | ✓ |
| GDPR: eksport/anonymisering af kunde | | | ✓ | ✓ |
| Købspris på biler | | | ✓ | ✓ |
