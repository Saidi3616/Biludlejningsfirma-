-- "00:00" som lukketid betyder midnat (se src/server/availability/opening-hours.ts), så døgnåbent
-- kan gemmes som 00:00–00:00.
ALTER TABLE "OpeningHours" DROP CONSTRAINT "opening_hours_times";
ALTER TABLE "OpeningHours"
  ADD CONSTRAINT "opening_hours_times"
    CHECK ("closed" OR ("opensAt" IS NOT NULL AND "closesAt" IS NOT NULL
      AND ("closesAt" > "opensAt" OR "closesAt" = '00:00')));
