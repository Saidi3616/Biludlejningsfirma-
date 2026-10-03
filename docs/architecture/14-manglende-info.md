# M — Information der mangler fra virksomheden

Markeret med **🔴 blokerer** (skal afklares før den relevante milestone), **🟡 vigtigt** (før launch), **⚪ kan vente**.

## Virksomhed og marked

| # | Spørgsmål | Prioritet | Påvirker |
|---|---|---|---|
| 1 | Firmanavn, brand, logo, CVR, adresse, telefon, WhatsApp-nummer, e-mail | 🔴 | M1, M6, kontrakt |
| 2 | **Hvor opererer virksomheden?** Kravene nævner danske byer, men også arabisk, fransk og MAD (marokkanske dirham). Er der planer om lokationer i Marokko? | 🔴 | Valuta, betaling, juridik, hosting |
| 3 | Hvilke lokationer ved launch, med adresser, åbningstider og helligdage? | 🔴 | M2, M6 |
| 4 | Hvilke sprog skal være klar ved launch, og hvem leverer/godkender oversættelser (især arabisk)? | 🟡 | M1, M17 |
| 5 | Domæne(r) og adgang til DNS | 🟡 | M0, e-mail |
| 6 | Eksisterende systemer (bookingsystem, regnskab, Excel-lister over flåden) der skal migreres eller integreres? | 🟡 | M2, PHASE 2 |
| 7 | Eksisterende anmeldelser (Google Business Profile, Trustpilot)? | ⚪ | M14 |

## Flåde

| # | Spørgsmål | Prioritet |
|---|---|---|
| 8 | Flådeliste: antal biler, mærke/model/årgang, reg.nr., VIN, gear, brændstof, sæder, bagage, kategori, hjemlokation | 🔴 |
| 9 | Har I flere ens biler af samme model? (bekræfter [K5](13-konflikter.md#k5-booking-af-specifik-bil-eller-biltype)) | 🔴 |
| 10 | Professionelle bilfotos (eller budget til fotografering) | 🟡 |
| 11 | Klargøringstid mellem to lejer (buffer, fx 2 timer)? | 🔴 |
| 12 | Må bilen afleveres på en anden lokation end afhentning (one-way)? Gebyr? | 🔴 |

## Priser og vilkår

| # | Spørgsmål | Prioritet |
|---|---|---|
| 13 | Prisliste pr. kategori (1/3/7/30 dage) og godkendelse af trappe-reglen i [K3](13-konflikter.md#k3-prisberegning-dage--dagspris-vs-pakkepriser) | 🔴 |
| 14 | **Definition af en lejedag:** 24-timers blokke? Tolerance før ekstra dag (fx 59 min)? Mindste varsel for online-booking (foreløbig 2 timer, `src/config/rental.ts`)? | 🔴 |
| 15 | Sæsonpriser / weekendpriser? | 🟡 |
| 16 | Depositum pr. kategori, og accept af løsningen i [K6](13-konflikter.md#k6-depositum) | 🔴 |
| 17 | Inkluderede km pr. dag og pris pr. ekstra km pr. kategori | 🔴 |
| 18 | Brændstofpolitik (fuld-til-fuld?) og pris for manglende brændstof/opladning. Forslag i `feeRates`: 100 kr. pr. ottendedel tank | 🔴 |
| 19 | Gebyr for for sen aflevering. Forslag i `feeRates`: 150 kr. pr. påbegyndt time efter 59 min, højst 8 timer pr. døgn | 🔴 |
| 20 | Annulleringspolitik (fx gratis indtil 48 t før, derefter X %) og no-show. *Forslag i `src/config/rental.ts`: gratis indtil 48 t før, derefter 50 % refusion indtil afhentning* | 🔴 |
| 21 | Ekstraudstyr: liste, priser (pr. dag/pr. booking, loft), antal på lager | 🔴 |
| 22 | Leveringsgebyr: zoner/afstand, maks. afstand, tidsvinduer, lufthavnsgebyr | 🔴 |
| 23 | Er priser inkl. moms? Skal der udstedes fakturaer med moms (B2B med CVR)? | 🔴 |
| 24 | Lejebetingelser og forsikringsvilkår (selvrisiko, hvad dækkes, hvem er forsikringsselskab) — gennemgået af jurist | 🔴 |
| 25 | Aldersgrænse og krav til kørekort (minimum år, ikke-EU kørekort, internationalt kørekort) | 🔴 |
| 26 | Ekstra chauffør: skal deres oplysninger registreres? | 🟡 |
| 27 | Betalingsformer ved skranken (kontant, kort, faktura)? | 🟡 |

## Drift og kommunikation

| # | Spørgsmål | Prioritet |
|---|---|---|
| 28 | Hvem er brugere i admin (antal, roller)? Hvem er SUPER_ADMIN? | 🟡 |
| 29 | Hvornår præcis sendes "Din bil er klar" — manuelt af staff eller automatisk X timer før? | 🟡 |
| 30 | Hvor længe før aflevering sendes "Din lejeperiode udløber"? | 🟡 |
| 31 | Skal kørekort/ID fotograferes og gemmes? Hvor længe? | 🔴 (GDPR) |
| 32 | Hvordan håndteres skader økonomisk i dag (selvrisiko, takseringsproces)? | 🟡 |
| 33 | Kan kunden selv ændre datoer online i MVP, eller via kundeservice? (forslag: kundeservice i MVP) | ⚪ |

## Konti og juridik (kræver virksomhedens handling)

| # | Handling | Prioritet |
|---|---|---|
| 34 | Opret Stripe-konto (kræver CVR, bank, ejeroplysninger) og aktivér MobilePay | 🔴 før M7 |
| 35 | Ansøg om WhatsApp Business API via Meta Business Manager (tager tid — start nu) | 🟡 |
| 36 | Google Cloud-konto til Maps | 🟡 |
| 37 | Privatlivspolitik, cookiepolitik og databehandleraftaler — juridisk gennemgang | 🔴 før launch |
| 38 | Budget for drift (hosting, Stripe-gebyrer, WhatsApp pr. besked, Maps) — estimat leveres separat | 🟡 |
| 39 | Opret Cloudflare R2 (EU) eller AWS S3 med en privat og en offentlig bucket til fotos og dokumenter; nøgler sættes hos hostingen | 🔴 før launch |
| 40 | Hvor mange fotos skal tages ved udlevering/aflevering, og hvor længe gemmes de? | 🟡 (GDPR) |
