/**
 * Hvornår de automatiske beskeder sendes, og hvor hårdt afsendelsen prøver igen
 * (07-api.md: maks. 5 forsøg, derefter FAILED).
 */
export const notificationRules = {
  /** Påmindelse før afhentning. */
  pickupReminderHoursBefore: 24,
  /** "Din lejeperiode udløber" før aflevering. */
  returnReminderHoursBefore: 3,
  /** Anmodning om anmeldelse efter afsluttet leje. */
  reviewRequestHoursAfter: 24,
  maxAttempts: 5,
  /** Ventetid før forsøg 2, 3, 4 og 5. */
  backoffMinutes: [1, 5, 15, 60],
  /** Så længe en afsendelse må tage, før en anden kørsel må overtage rækken. */
  leaseMinutes: 10,
  /** Rækker pr. cron-kørsel. */
  batchSize: 50,
} as const;
