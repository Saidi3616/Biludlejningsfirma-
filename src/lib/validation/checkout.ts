import { z } from "zod";
import { bookingCustomerSchema } from "./booking";

/**
 * Bookingflowets valg i URL'en (/booking?car=…&pickupDate=…&x_gps=1&zone=10&discount=…), så
 * tilbage-knappen og delte links virker. Ekstraudstyr er felter med præfikset "x_".
 */
const EXTRA_PREFIX = "x_";

export const checkoutQuerySchema = z.object({
  car: z
    .string()
    .regex(/^[a-z0-9-]{1,80}$/)
    .optional()
    .catch(undefined),
  /** Leveringszonens maks. afstand i km; tom = afhentning på kontoret. */
  zone: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
  discount: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9-]*$/)
    .transform((code) => code.toUpperCase() || undefined)
    .optional()
    .catch(undefined),
  step: z.enum(["extras", "details"]).default("extras").catch("extras"),
});

export type CheckoutQuery = z.output<typeof checkoutQuerySchema> & {
  extras: { code: string; quantity: number }[];
};

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseCheckoutQuery(params: Params): CheckoutQuery {
  const flat = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, first(value)]),
  );
  const extras = Object.entries(flat).flatMap(([key, value]) => {
    if (!key.startsWith(EXTRA_PREFIX)) return [];
    const code = key.slice(EXTRA_PREFIX.length);
    const quantity = Number(value);
    if (!/^[a-z0-9_-]{1,64}$/.test(code) || !Number.isInteger(quantity) || quantity < 1) return [];
    return [{ code, quantity: Math.min(quantity, 10) }];
  });
  return { ...checkoutQuerySchema.parse(flat), extras };
}

/** Valgene som URL-parametre, til links mellem trinene og skjulte felter i formularerne. */
export function checkoutQueryParams(query: CheckoutQuery): Record<string, string> {
  return {
    ...(query.car ? { car: query.car } : {}),
    ...(query.zone ? { zone: String(query.zone) } : {}),
    ...(query.discount ? { discount: query.discount } : {}),
    ...Object.fromEntries(
      query.extras.map((extra) => [`${EXTRA_PREFIX}${extra.code}`, String(extra.quantity)]),
    ),
  };
}

export function extraFieldName(code: string) {
  return `${EXTRA_PREFIX}${code}`;
}

/** Danske numre kan skrives uden landekode; mellemrum og bindestreger fjernes. */
export function normalizePhone(value: string): string {
  const compact = value.replace(/[\s().-]/g, "");
  if (/^\d{8}$/.test(compact)) return `+45${compact}`;
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  return compact;
}

/** Trin 2: kundens oplysninger. Bilen, perioden og valgene kommer fra de skjulte felter. */
export const checkoutDetailsSchema = z.object({
  firstName: bookingCustomerSchema.shape.firstName,
  lastName: bookingCustomerSchema.shape.lastName,
  email: bookingCustomerSchema.shape.email,
  phone: z
    .string()
    .trim()
    .transform(normalizePhone)
    .pipe(z.string().regex(/^\+[1-9]\d{6,14}$/)),
  deliveryAddress: z
    .string()
    .trim()
    .max(300)
    .transform((value) => value || null)
    .nullish(),
  acceptTerms: z.literal("on"),
  idempotencyKey: z.uuid(),
});

export type CheckoutDetailsField = keyof z.input<typeof checkoutDetailsSchema>;
