/**
 * Oversætter databasefejl til noget, servicelaget kan reagere på, fx
 * "booking_no_overlap" → "bilen er netop blevet booket".
 */
type DriverCause = {
  code?: string;
  message?: string;
  originalMessage?: string;
  /** Sat ved unikhedsfejl, fx { index: "Booking_reference_key" }. */
  constraint?: { index?: string };
};

function driverCause(error: unknown): DriverCause | undefined {
  const meta = (error as { meta?: { driverAdapterError?: { cause?: DriverCause } } })?.meta;
  return meta?.driverAdapterError?.cause;
}

/** Navnet på det constraint, der afviste skrivningen, eller null. */
export function violatedConstraint(error: unknown): string | null {
  const cause = driverCause(error);
  if (cause?.constraint?.index) return cause.constraint.index;
  const message = cause?.message ?? cause?.originalMessage ?? "";
  return message.match(/constraint "([^"]+)"/)?.[1] ?? null;
}

/** Postgres-fejlkode (SQLSTATE), fx "23P01" for exclusion_violation. */
export function postgresErrorCode(error: unknown): string | null {
  return driverCause(error)?.code ?? null;
}

/** Bilen er optaget i perioden (anden booking eller vedligehold). */
export function isCarUnavailableError(error: unknown): boolean {
  return [
    "booking_no_overlap",
    "booking_maintenance_overlap",
    "maintenance_no_overlap",
    "maintenance_booking_overlap",
  ].includes(violatedConstraint(error) ?? "");
}
