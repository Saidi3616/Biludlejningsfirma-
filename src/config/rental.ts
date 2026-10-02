/**
 * Udlejningsregler, som virksomheden skal bekræfte (14-manglende-info.md, punkt 14).
 * Ændres de, ændres prisen for nye tilbud; eksisterende bookinger har deres egne linjer.
 */
export const rentalRules = {
  /** En lejedag er 24 timer. Afleveres bilen højst så mange minutter for sent, tæller det ikke. */
  graceMinutes: 59,
  /** Længste leje, der kan bookes online. Længere lejer aftales direkte. */
  maxRentalDays: 90,
  /** Lejer over så mange dage: depositum trækkes og refunderes ved aflevering i stedet for et hold (K6). */
  depositHoldMaxDays: 7,
  /** Online-booking skal ske mindst så mange minutter før afhentning (klargøring af bilen). */
  minLeadMinutes: 120,
  /** En ubetalt booking holder bilen så længe (01-systemarkitektur.md, beslutning 2). */
  reservationMinutes: 15,
  /** Dansk moms. Alle priser er inkl. moms. */
  vatRatePercent: 25,
  /** Version af lejevilkårene (/terms), som kunden accepterer ved booking. Ændres ved nye vilkår. */
  termsVersion: "2026-10-udkast",
} as const;

/**
 * Annulleringspolitik (05-user-flows.md, E4). Mangler fra virksomheden (14-manglende-info.md,
 * punkt 20); værdierne er et forslag. Kunden ser altid refusionsbeløbet, før annulleringen bekræftes.
 */
export const cancellationPolicy = {
  /** Gratis annullering (fuld refusion) indtil så mange timer før afhentning. */
  freeUntilHoursBefore: 48,
  /** Refusion i procent ved senere annullering, indtil afhentning. Derefter kan der ikke annulleres online. */
  lateRefundPercent: 50,
} as const;
