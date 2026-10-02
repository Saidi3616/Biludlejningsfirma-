# H — Komponentstruktur

Tre niveauer. En komponent må kun importere fra sit eget niveau eller niveauer under.

```
1. ui/        Designsystem — generiske, ingen forretningslogik, ingen datahentning
2. features/  Domænekomponenter — kender "bil", "booking", men henter ikke data selv
3. app/       Sider (Server Components) — henter data via services og sætter features sammen
```

## 1. Designsystem (`src/components/ui`)

Alle bygget på design-tokens (CSS-variabler + Tailwind theme), understøtter RTL (logical properties: `ms-`, `me-`, `ps-`, `pe-`), dark-mode-klar men lyst tema i MVP.

| Kategori | Komponenter |
|---|---|
| Tokens | `colors` (brand, neutral, success, warning, danger, info), `typography` (display, h1–h4, body, small, caption), `spacing`, `radius`, `shadow`, `motion` (varigheder, easing — respekterer `prefers-reduced-motion`) |
| Handlinger | `Button` (primary, secondary, ghost, danger, whatsapp; sm/md/lg; loading), `IconButton`, `LinkButton` |
| Formularer | `Field` (label + hjælpetekst + fejl), `Input`, `Textarea`, `Select`, `Combobox`, `Checkbox`, `RadioGroup`, `Switch`, `DatePicker`, `DateRangePicker`, `TimeSelect`, `PhoneInput` (E.164), `Stepper` (antal), `FileUpload` |
| Layout | `Container`, `Stack`, `Grid`, `Section`, `Divider`, `AspectRatio` |
| Overflader | `Card`, `Sheet` (mobil bundark), `Dialog`/`Modal`, `Drawer`, `Popover`, `Tooltip`, `Tabs`, `Accordion` |
| Feedback | `Alert`, `Toast`, `Skeleton`, `Spinner`, `EmptyState`, `ErrorState`, `ProgressSteps` |
| Data | `Table` (sortering, sticky header, mobil = kort-liste), `DataList`, `Pagination`, `StatCard`, `Chart` (wrapper om Recharts) |
| Status | `Badge`, `StatusBadge` (mapper bookingstatus/betalingsstatus/bilstatus → farve + ikon + tekst — farve er aldrig eneste signal), `Rating` |
| Navigation | `Navbar`, `MobileNav`, `Breadcrumbs`, `LanguageSwitcher`, `CurrencySwitcher`, `SkipLink` |
| Medier | `Image` (next/image wrapper med blur-placeholder), `ImagePlaceholder` (viser motiv, format, aspect ratio — jf. §53), `Gallery`/`Lightbox` |
| Andet | `Price` (formatterer minor-beløb + valuta efter locale), `DateTime`, `VisuallyHidden` |

## 2. Feature-komponenter (`src/components/features`)

```
layout/        SiteHeader, SiteFooter, WhatsAppFloatingButton, CookieBanner, AdminShell, AdminSidebar
home/          Hero, HeroBookingWidget, PopularCars, WhyUs, HowItWorks, ReviewsCarousel, WhatsAppCta
search/        SearchForm (genbruges i hero, katalog, bil-side), LocationSelect, DateTimeRangeInput
cars/          CarCard, CarGrid, CarFilters (desktop sidebar / mobil Sheet), CarSort, CarSpecs,
               CarGallery, CarPriceTable, AvailabilityChecker, CarJsonLd
booking/       BookingSteps, ExtrasSelector, ExtraCard, FulfilmentChoice (afhent/levering), DeliveryAddressForm,
               CustomerDetailsForm, AuthOrGuestChoice, PriceSummary (sticky), DiscountCodeInput,
               TermsAcceptance, PaymentStep (Stripe Payment Element), ReservationTimer, BookingConfirmation
account/       AccountNav, BookingList, BookingDetail, PaymentList, DocumentList, ProfileForm, PrivacyCenter
contact/       ContactInfo, ContactForm, OpeningHours, MapEmbed (indlæses efter samtykke)
reviews/       ReviewCard, ReviewForm
admin/
  dashboard/   TodayTimeline, KpiCards, ActionItems
  calendar/    FleetTimeline, CalendarToolbar, BookingBlock
  bookings/    BookingTable, BookingFilters, BookingDetailPanel, BookingActions, StatusHistory, SendMessageDialog
  payments/    PaymentsPanel, DepositPanel, RefundDialog, ManualPaymentDialog
  inspections/ InspectionWizard (mobil), PhotoCapture, CarDamageMap (bildiagram med klikbare områder), BeforeAfterCompare
  fleet/       CarModelForm, CarForm, CarLifecycle, ImageManager, MaintenanceForm
  pricing/     PricingMatrix, PricingPreview
  extras/ discounts/ locations/ users/ messages/ reviews/ statistics/ (forms + tabeller)
```

### Eksempel: `PriceSummary`
- Input: `Quote` (fra `pricing.quote()`), `currency`, `variant: 'sidebar' | 'sticky-bar' | 'full'`.
- Viser: leje (antal dage × dagspris, med trappe-forklaring), ekstraudstyr, gebyrer, rabat, **total**, og **depositum separat** med forklaring "reserveres på dit kort ved afhentning, trækkes ikke".
- Viser "Inkluderet" (fx 200 km/dag, forsikring, moms) og "Ikke inkluderet" (fx brændstof, ekstra km à X kr.).
- Beregner intet selv.

## 3. Sider (`src/app`)

Sider er tynde: hent data via service → render features. Klientkomponenter (`'use client'`) bruges kun hvor interaktion kræver det (filtre, booking-steps, datepicker, Stripe). Alt andet er Server Components for hurtig mobil-indlæsning.

## Designsystem-retning (detaljeres i milestone M1)

- **Farver:** dyb, troværdig hovedfarve (fx petrol/dyb blå) + én varm accentfarve til CTA, rigeligt med neutrale gråtoner. WhatsApp-grøn kun på WhatsApp-elementer. Alle tekst/baggrund-kombinationer ≥ WCAG AA (4.5:1).
- **Typografi:** én moderne grotesk (fx *Inter* eller *Geist*) til UI + evt. én karakterfuld display-font til overskrifter; arabisk fallback-font (fx *IBM Plex Sans Arabic* eller *Noto Sans Arabic*).
- **Undgå "generisk AI-look":** ingen lilla gradienter, ingen glas-kort overalt, ingen emoji-ikoner. Rigtige bilfotos, stramt grid, tydelig typografisk hierarki, ét gennemgående ikonsæt (Lucide).
- Billeder mangler → `ImagePlaceholder` med beskrivelse, fx *"Premium black SUV, Copenhagen city background, professional automotive photography, 16:9."*
