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
  /** Dansk moms. Alle priser er inkl. moms. */
  vatRatePercent: 25,
} as const;
