-- Forretningsregler, som Prisma-skemaet ikke kan udtrykke.
-- Se docs/architecture/03-database-erd.md ("Constraints og indekser").

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─── Booking ─────────────────────────────────────────────────────────────────

ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_return_after_pickup"
    CHECK ("returnAt" > "pickupAt"),
  ADD CONSTRAINT "booking_blocked_covers_rental"
    CHECK ("blockedFrom" <= "pickupAt" AND "blockedUntil" >= "returnAt"),
  ADD CONSTRAINT "booking_amounts_non_negative"
    CHECK ("subtotalMinor" >= 0 AND "discountMinor" >= 0 AND "totalMinor" >= 0 AND "depositMinor" >= 0),
  -- Ingen dobbeltbooking: to aktive bookinger af samme bil må ikke overlappe.
  -- Halvåbent interval [fra, til): en booking der slutter kl. 12 og en der starter kl. 12 er ok.
  ADD CONSTRAINT "booking_no_overlap"
    EXCLUDE USING gist (
      "carId" WITH =,
      tstzrange("blockedFrom", "blockedUntil", '[)') WITH &&
    ) WHERE ("status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'ACTIVE'));

-- ─── Vedligehold ─────────────────────────────────────────────────────────────

ALTER TABLE "Maintenance"
  ADD CONSTRAINT "maintenance_ends_after_start"
    CHECK ("endsAt" > "startsAt"),
  ADD CONSTRAINT "maintenance_no_overlap"
    EXCLUDE USING gist (
      "carId" WITH =,
      tstzrange("startsAt", "endsAt", '[)') WITH &&
    ) WHERE ("status" IN ('PLANNED', 'IN_PROGRESS'));

-- ─── Booking mod vedligehold ─────────────────────────────────────────────────
-- Et EXCLUDE-constraint kan ikke spænde over to tabeller, så overlap mellem
-- booking og vedligehold håndhæves af triggere. En advisory lock pr. bil gør, at
-- to samtidige transaktioner på samme bil venter på hinanden i stedet for at
-- begge se "ingen konflikt".

CREATE FUNCTION lock_car(car_id uuid) RETURNS void
LANGUAGE sql AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('car:' || car_id::text, 0));
$$;

CREATE FUNCTION booking_check_maintenance() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Ugyldige perioder afvises af CHECK-constraints med en tydelig fejl.
  IF NEW."status" NOT IN ('PENDING_PAYMENT', 'CONFIRMED', 'ACTIVE')
     OR NEW."blockedUntil" <= NEW."blockedFrom" THEN
    RETURN NEW;
  END IF;

  PERFORM lock_car(NEW."carId");

  IF EXISTS (
    SELECT 1 FROM "Maintenance" m
    WHERE m."carId" = NEW."carId"
      AND m."status" IN ('PLANNED', 'IN_PROGRESS')
      AND tstzrange(m."startsAt", m."endsAt", '[)')
          && tstzrange(NEW."blockedFrom", NEW."blockedUntil", '[)')
  ) THEN
    RAISE EXCEPTION 'conflicting key value violates exclusion constraint "booking_maintenance_overlap"'
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'booking_maintenance_overlap',
            DETAIL = format('Car %s is in maintenance during the requested period.', NEW."carId");
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "booking_check_maintenance"
  BEFORE INSERT OR UPDATE OF "carId", "blockedFrom", "blockedUntil", "status" ON "Booking"
  FOR EACH ROW EXECUTE FUNCTION booking_check_maintenance();

CREATE FUNCTION maintenance_check_bookings() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" NOT IN ('PLANNED', 'IN_PROGRESS') OR NEW."endsAt" <= NEW."startsAt" THEN
    RETURN NEW;
  END IF;

  PERFORM lock_car(NEW."carId");

  IF EXISTS (
    SELECT 1 FROM "Booking" b
    WHERE b."carId" = NEW."carId"
      AND b."status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'ACTIVE')
      AND tstzrange(b."blockedFrom", b."blockedUntil", '[)')
          && tstzrange(NEW."startsAt", NEW."endsAt", '[)')
  ) THEN
    RAISE EXCEPTION 'conflicting key value violates exclusion constraint "maintenance_booking_overlap"'
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'maintenance_booking_overlap',
            DETAIL = format('Car %s has active bookings during the requested period.', NEW."carId");
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "maintenance_check_bookings"
  BEFORE INSERT OR UPDATE OF "carId", "startsAt", "endsAt", "status" ON "Maintenance"
  FOR EACH ROW EXECUTE FUNCTION maintenance_check_bookings();

-- ─── Øvrige regler ───────────────────────────────────────────────────────────

ALTER TABLE "Car"
  ADD CONSTRAINT "car_fuel_level_range" CHECK ("fuelLevel" BETWEEN 0 AND 8),
  ADD CONSTRAINT "car_odometer_non_negative" CHECK ("odometerKm" >= 0);

ALTER TABLE "CarModel"
  ADD CONSTRAINT "car_model_capacity_positive" CHECK ("seats" > 0 AND "bags" >= 0 AND "doors" > 0),
  ADD CONSTRAINT "car_model_amounts_non_negative"
    CHECK ("includedKmPerDay" >= 0 AND "extraKmFeeMinor" >= 0 AND "depositMinor" >= 0);

ALTER TABLE "PricingRule"
  ADD CONSTRAINT "pricing_rule_valid"
    CHECK ("minDays" >= 1 AND "packageMinor" >= 0 AND "perDayMinor" >= 0),
  ADD CONSTRAINT "pricing_rule_period_valid"
    CHECK ("validFrom" IS NULL OR "validTo" IS NULL OR "validTo" >= "validFrom");

ALTER TABLE "Extra"
  ADD CONSTRAINT "extra_amounts_valid"
    CHECK ("priceMinor" >= 0 AND ("maxPriceMinor" IS NULL OR "maxPriceMinor" >= "priceMinor")
           AND "maxQuantity" >= 1 AND ("stock" IS NULL OR "stock" >= 0));

ALTER TABLE "Discount"
  ADD CONSTRAINT "discount_code_uppercase" CHECK ("code" = upper("code")),
  ADD CONSTRAINT "discount_value_valid"
    CHECK (("type" = 'PERCENT' AND "value" BETWEEN 1 AND 100)
        OR ("type" = 'FIXED' AND "value" > 0 AND "currency" IS NOT NULL)),
  ADD CONSTRAINT "discount_period_valid"
    CHECK ("validFrom" IS NULL OR "validTo" IS NULL OR "validTo" > "validFrom");

ALTER TABLE "Review"
  ADD CONSTRAINT "review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "OpeningHours"
  ADD CONSTRAINT "opening_hours_day_or_date"
    CHECK (("weekday" BETWEEN 1 AND 7 AND "specialDate" IS NULL)
        OR ("weekday" IS NULL AND "specialDate" IS NOT NULL)),
  ADD CONSTRAINT "opening_hours_times"
    CHECK ("closed" OR ("opensAt" IS NOT NULL AND "closesAt" IS NOT NULL AND "closesAt" > "opensAt"));

ALTER TABLE "Inspection"
  ADD CONSTRAINT "inspection_values_valid" CHECK ("fuelLevel" BETWEEN 0 AND 8 AND "odometerKm" >= 0);
