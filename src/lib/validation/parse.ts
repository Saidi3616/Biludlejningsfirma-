import type { z } from "zod";
import { AppError } from "@/lib/errors";

/** Validerer input eller kaster `VALIDATION_FAILED` med de felter, der fejlede. */
export function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): z.output<Schema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "Ugyldig forespørgsel", {
      fields: [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))],
    });
  }
  return parsed.data;
}
