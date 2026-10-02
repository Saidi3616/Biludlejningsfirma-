# L — Tekniske risici

| # | Risiko | Konsekvens | Sandsynlighed | Afbødning |
|---|---|---|---|---|
| R1 | **Dobbeltbooking ved samtidige requests** | To kunder har betalt for samme bil | Mellem | `EXCLUDE`-constraint i Postgres (ikke kun app-tjek); samtidighedstest i CI; reservation før betaling |
| R2 | **Betaling lykkes, men booking fejler / webhook går tabt** | Kunde har betalt uden booking | Lav–mellem | Booking eksisterer før betaling; webhooks idempotente; nattligt afstemningsjob mod Stripe (betalinger uden CONFIRMED booking → alarm); Stripe genforsøger webhooks i 3 dage |
| R3 | **Reservation udløber mens kunden betaler** (fx langsom 3-D Secure) | Bilen er frigivet; betaling lander alligevel | Lav | 15 min + timer i UI; ved sen betaling forsøges genaktivering; ellers automatisk refund + besked + alarm |
| R4 | **Depositum-hold udløber** (kort-reservationer holder typisk 7 dage) | Depositum kan ikke trækkes ved lange lejer | Høj ved lejer > 7 dage | Hold placeres ved afhentning, ikke ved booking; lejer > 7 dage: depositum trækkes og refunderes ved aflevering (kræver accept i vilkår). Se [K6](13-konflikter.md#k6-depositum) |
| R5 | **Tidszoner og sommertid** | Forkert antal lejedage, forkert pris, forkerte påmindelser | Mellem | Alt i UTC i DB, lokationens tidszone ved visning/beregning; dedikerede tests omkring sommertidsskift |
| R6 | **Definition af "lejedag"** uklar | Tvister om pris | Høj | Eksplicit regel (24-timers blokke + tolerance, fx 59 min) — skal godkendes, se [14](14-manglende-info.md) |
| R7 | **WhatsApp Business API godkendes ikke/forsinkes** | Automatiske WhatsApp-beskeder virker ikke ved launch | Mellem | E-mail som primær automatisk kanal; WhatsApp click-to-chat virker uden API; adapter klar til aktivering |
| R8 | **WhatsApp-skabelonregler** (business-initierede beskeder kræver godkendte skabeloner + opt-in; 24-timers vindue) | Beskeder afvises | Mellem | Skabeloner pr. sprog oprettes tidligt; opt-in-checkbox i booking; status fra webhook vises i admin |
| R9 | **E-mails havner i spam** | Kunden ser ikke bekræftelse | Mellem | SPF/DKIM/DMARC; dedikeret afsenderdomæne; bounce-webhooks; bekræftelse vises også på skærm + /account |
| R10 | **Lækage af følsomme data** (kørekort, ID-billeder) | GDPR-brud, bøder, tillidstab | Lav (med tiltag) | Privat bucket + signerede URL'er; feltkryptering; log-redaction; adgangskontrol pr. rolle; retention-sletning; audit log; DPA'er |
| R11 | **Broken access control** (kunde ser andres booking via ID) | Datalæk | Mellem | Policies i servicelaget; ikke-gættelige referencer; tests pr. endpoint for hver rolle |
| R12 | **Scope creep** — master prompten er meget bred | MVP bliver aldrig færdig | Høj | Strikt MVP/PHASE 2-opdeling; acceptkriterierne i §55 er definitionen af "færdig" |
| R13 | **Prislogik bliver kompleks** (trapper, sæson, overrides, rabatter, levering, valuta) | Fejlberegninger, svært at forklare kunden | Mellem | Én ren `quote()`-funktion med fuld testdækning; linjer forklares i UI; admin preview |
| R14 | **Valuta (MAD, EUR, GBP)** | Kursrisiko, forkerte beløb, MAD understøttes ikke som afregningsvaluta | Mellem | MVP: betaling i DKK, øvrige valutaer kun vist med kurs og disclaimer. Se [K10](13-konflikter.md#k10-valuta) |
| R15 | **RTL-layout (arabisk) går i stykker** | Uprofessionelt på arabisk | Mellem | Logical CSS properties fra dag 1; Playwright-screenshots i `ar` |
| R16 | **Serverless-begrænsninger** (cron-frekvens, timeout ved PDF/billedbehandling) | Langsomme/fejlende jobs | Lav–mellem | Små jobs; billeder uploades direkte til storage via signerede URL'er; kan skifte til Inngest/worker uden ændringer i services |
| R17 | **Vendor lock-in** (Vercel, Neon, Stripe) | Dyrt at skifte | Lav | Standard Postgres; adaptere for tredjeparter; Next.js standalone-build kan køre i Docker |
| R18 | **Ingen rigtige bilbilleder/tekster ved launch** | Ser ufærdigt ud | Høj | Tidlig liste over nødvendige fotos (motiv, format, ratio); `ImagePlaceholder` under udvikling |
| R19 | **Juridisk: digital kontrakt og signatur** | Kontrakt kan anfægtes | Lav–mellem | Simpel e-signatur + tidsstempel + snapshot + IP-hash + PDF-hash; vilkår gennemgås af jurist; MitID som PHASE 2 |
| R20 | **Performance på mobil** (store billeder, mange filtre) | Lav konvertering | Mellem | Server Components, next/image, lazy loading, caching af katalog, indekser; Lighthouse-budget i CI |
