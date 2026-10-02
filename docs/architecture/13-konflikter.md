# Konflikter og uklarheder i kravene (§57)

For hver: konflikten, kort forklaring, anbefalet robust løsning. Den konkrete implementering af hver konfliktende del venter på godkendelse.

## K1. Bookingstatus blander booking og betaling

**Konflikt:** §13 lister `Pending, Confirmed, Paid, Active, Completed, Cancelled, Refunded` som én statusliste. "Paid" og "Refunded" er betalingstilstande, ikke booking-tilstande. En booking kan fx være *Cancelled* og *Refunded* samtidig, eller *Active* og kun delvist betalt (skrankebooking).
**Anbefaling:** to felter.
- `status`: `PENDING_PAYMENT → CONFIRMED → ACTIVE → COMPLETED`, samt `CANCELLED`, `EXPIRED`, `NO_SHOW`.
- `payment_status`: `UNPAID, PAID, PARTIALLY_REFUNDED, REFUNDED, FAILED` (+ separat `deposit_status`).
UI viser begge som badges. Kunden ser den forventede liste (fx "Bekræftet · Betalt").

## K2. Bilstatus: to forskellige lister

**Konflikt:** §19 har `Available, Reserved, Rented, Maintenance, Unavailable`; §44 har livscyklussen `Available → Reserved → Rented → Returned → Inspection → Maintenance → Available`. Desuden er "Reserved" og "Rented" afhængige af tid — en bil kan være ledig i dag og reserveret i næste uge. En statisk statuskolonne vil blive forkert.
**Anbefaling:** gem kun den operationelle tilstand på bilen: `ACTIVE` (kan udlejes), `INSPECTION`, `MAINTENANCE`, `OUT_OF_SERVICE`, `RETIRED`. Vis den *afledte* status i admin for "nu": `Ledig / Reserveret (booking kl. 14) / Udlejet / Returneret – afventer inspektion / Service`. Livscyklussen fra §44 vises derfor præcist, men beregnes fra bookinger + inspektioner. `Maintenance` efter returnering er valgfri (ikke hver gang).

## K3. Prisberegning: "dage × dagspris" vs. pakkepriser

**Konflikt:** §10 siger *antal dage × relevant dagspris*, men §8 giver totalpriser for pakker (3 dage = 999 kr., ikke 3 × 399). Det er uklart, hvad 5 dage koster.
**Anbefaling:** prisrapper, hvor hvert trin har en *dagspris* udledt af pakkeprisen, og prisen aldrig overstiger næste pakke:
- 1–2 dage: 399/dag · 3–6 dage: 333/dag · 7–29 dage: 285,57/dag · 30+: 233,30/dag
- 5 dage = 5 × 333 = 1.665 kr. (< 1.999 for 7 dage ✓)
- Loft-regel: prisen for N dage er altid min(N × trappens dagspris, næste pakkepris). Kunden betaler dermed aldrig mere for færre dage (fx 25 dage × 285,57 = 7.139 kr. → loftet til 6.999 kr.).
- Afrunding til hele kroner.
Virksomheden skal bekræfte reglen.

> **Implementeret (M4)** i `src/server/pricing/ladder.ts`. Præcis en pakkes antal dage koster altid pakkeprisen. Ellers er prisen dage × trappens dagspris, rundet til hele kroner og loftet af den billigste større pakke. En lejedag er påbegyndte 24 timer målt på lokationens lokale ur (så sommertid ikke ændrer prisen) med 59 minutters tolerance; begge tal står i `src/config/rental.ts`, indtil virksomheden har bekræftet dem (se [14](14-manglende-info.md), punkt 14). Rabatkoder giver rabat på leje og ekstraudstyr, ikke på leverings- og one-way-gebyrer.

## K4. Priser pr. bil eller pr. kategori

**Konflikt:** §8 siger "en bil kan have dagspris…", men eksemplet er pr. kategori ("Economy").
**Anbefaling:** priser sættes pr. kategori (nemt at vedligeholde), med valgfri override pr. bilmodel og sæsonperioder.

## K5. Booking af specifik bil eller biltype

**Konflikt:** Kunden vælger en specifik bil (/cars/[id], "Book denne bil"), men admin skal kunne flytte bookinger, når en bil går i stykker (§42), og flåder har ofte flere ens biler. Hvis kataloget viser fysiske biler, vises dubletter, og en defekt bil ødelægger bookingen.
**Anbefaling:** kataloget viser *bilmodeller* (`CarModel`), og systemet tildeler et konkret køretøj automatisk i booking-transaktionen. Har flåden kun én af hver, oplever kunden præcis det samme. Admin kan omplacere til en anden bil af samme model uden at kunden påvirkes. (Branchestandarden "eller lignende" kan tilføjes som valgmulighed, hvis virksomheden ønsker det.)

## K6. Depositum

**Konflikt:** §14 vil håndtere depositum via betalingsløsningen og understøtte MobilePay. Men kort-reservationer (hold) udløber typisk efter 7 dage, så et hold ved booking for en tur om 3 uger eller en 30-dages leje virker ikke. MobilePay understøtter ikke depositum-hold på samme måde som kort.
**Anbefaling:**
- Depositum reserveres **ved afhentning** (ikke ved booking) som kort-hold.
- Lejer > 7 dage: depositum *trækkes* og refunderes ved aflevering (tydeligt i vilkår og prisoversigt).
- Depositum kræver kort (debit/kredit); MobilePay kan bruges til selve lejen.
- Alternativ ved skranken: kontant/anden betaling registreres manuelt.

## K7. Gæstebooking vs. "Min konto"

**Konflikt:** §55 kræver "opret konto *eller fortsæt som gæst*", men kunden skal også kunne "se sin booking", få kontrakt, annullere osv.
**Anbefaling:** gæster får et sikkert "administrér booking"-link (`/booking/manage/[token]`) i e-mailen, med samme funktioner som kontoen for den ene booking. Efter booking tilbydes oprettelse af konto med ét klik; bookingen knyttes automatisk til kontoen via verificeret e-mail.

## K8. Ret til sletning vs. bogføringsloven

**Konflikt:** §24 kræver ret til sletning, men bogføringsloven kræver opbevaring af regnskabsmateriale (bookinger, betalinger, fakturaer) i 5 år. Skader og verserende krav skal også kunne dokumenteres.
**Anbefaling:** "slet" = **anonymisering**: navn, kontakt, kørekort, dokumenter og billeder af kunden fjernes; transaktionsdata bevares under pseudonym. Sletning blokeres midlertidigt ved aktiv booking eller uafklaret skade/krav. Retentionsperioder fastlægges i privatlivspolitikken.

## K9. Dataminimering vs. omfattende kundedata

**Konflikt:** §23 vil gemme fødselsdato, adresse og kørekortoplysninger; §24 kræver dataminimering.
**Anbefaling:** indsaml kun det, der er nødvendigt for lejen og forsikringen: fødselsdato (alderskrav), kørekortnummer + udløb + udstedelsesland (gyldighed). Adresse kun hvis forsikring/kontrakt kræver det eller ved levering. Kørekortbilleder kun hvis virksomheden har behov, og slettes automatisk efter lejen + X dage. Følsomme felter krypteres.

## K10. Valuta

**Konflikt:** §31 vil understøtte DKK, EUR, GBP og MAD uden ukontrolleret omregning. Men samtidig er alle lokationer i Danmark, priseksemplerne er i DKK, og MAD er ikke en valuta, Stripe kan afregne til en dansk virksomhed. Hvis kunden betaler i EUR, bærer virksomheden kursrisikoen.
**Anbefaling (MVP):** DKK er grundvaluta; alle priser gemmes i DKK. Andre valutaer **vises** som "ca. X EUR" beregnet server-side fra en dagligt opdateret kurs (gemt i `EXCHANGE_RATE`), og betaling sker i DKK (kundens bank omregner). PHASE 2: rigtige priser pr. valuta (manuelt fastsatte) og betaling i EUR/GBP. Se også [14](14-manglende-info.md) om MAD/Marokko.

## K11. URL-struktur og sprog

**Konflikt:** §4 lister URL'er uden sprog (`/cars`), mens §30 og §32 kræver flere sprog og SEO.
**Anbefaling:** dansk uden præfiks (`/cars`), andre sprog med præfiks (`/en/cars`, `/ar/cars`, `/fr/cars`) + `hreflang`. URL-segmenter forbliver engelske (simpelt, stabilt). Lokaliserede slugs (fx `/biler`) er PHASE 2, hvis SEO-data viser behov.

## K12. "Slet bil" og "slet ekstraudstyr" vs. historik

**Konflikt:** §19/§11 vil kunne slette biler og ekstraudstyr, men de er refereret i bookinger, kontrakter, skader og statistik.
**Anbefaling:** deaktivering/arkivering i stedet for sletning, når der findes referencer. Hard delete kun for poster, der aldrig er brugt.

## K13. Automatiske beskeder på tre kanaler

**Konflikt:** §17 vil sende syv beskeder via e-mail, WhatsApp og SMS. Sendes alt på alle kanaler, bliver det spam og dyrt; WhatsApp kræver opt-in og godkendte skabeloner.
**Anbefaling:** e-mail sendes altid (transaktionel). WhatsApp sendes, hvis kunden har givet opt-in i bookingflowet (forvalgt *fra*, én checkbox). SMS kun som PHASE 2-fallback til påmindelser. Kanalvalg pr. besked er konfigurerbart.

## K14. "Ingen skjulte gebyrer" vs. tillæg efter lejen

**Konflikt:** §45 lover ingen skjulte gebyrer, men §42 kræver tillæg for for sen aflevering, ekstra km og skader.
**Anbefaling:** alle mulige tillæg vises *før betaling* under "Ikke inkluderet" i prisoversigten og i kontrakten med konkrete satser (fx "Ekstra km: 2,50 kr./km", "For sen aflevering: X kr./time efter 59 min").

## K15. "Booking via WhatsApp"

**Konflikt:** §15 nævner booking via WhatsApp, men betaling og samtykke kan ikke gennemføres sikkert i en WhatsApp-chat.
**Anbefaling:** WhatsApp bruges til dialog; staff opretter bookingen i admin (telefonbooking-flowet) og sender et betalingslink. Ingen booking bekræftes uden betaling via Stripe eller eksplicit staff-handling.

## K16. Kundeanmeldelser på forsiden fra dag 1

**Konflikt:** Forsiden skal vise anmeldelser, men en ny platform har ingen verificerede anmeldelser. Opdigtede anmeldelser er ulovlige (markedsføringsloven).
**Anbefaling:** vis kun rigtige anmeldelser: enten importeret fra eksisterende Google/Trustpilot-profil (med kilde) eller udelad sektionen indtil der er mindst fx 5 verificerede anmeldelser.
