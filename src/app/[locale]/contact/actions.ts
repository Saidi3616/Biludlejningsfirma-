"use server";

import { headers } from "next/headers";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { submitContactMessage } from "@/server/contact/service";
import { clientIp } from "@/server/rate-limit";

const fieldNames = ["name", "email", "phone", "subject", "message", "website"] as const;

export type ContactState = {
  status: "idle" | "success" | "error";
  error?: "fields" | "rateLimited" | "generic";
  fields?: string[];
  /** Det udfyldte, så formularen ikke tømmes ved en fejl. */
  values?: Record<string, string>;
};

export async function sendContactMessage(
  _previous: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const values = Object.fromEntries(
    fieldNames.map((name) => [name, String(formData.get(name) ?? "")]),
  ) as Record<(typeof fieldNames)[number], string>;
  try {
    await submitContactMessage(values, { ip: clientIp(await headers()) });
    return { status: "success" };
  } catch (error) {
    if (error instanceof AppError && error.code === "VALIDATION_FAILED") {
      return {
        status: "error",
        error: "fields",
        fields: (error.details?.fields as string[]) ?? [],
        values,
      };
    }
    if (error instanceof AppError && error.code === "RATE_LIMITED") {
      return { status: "error", error: "rateLimited", values };
    }
    logger.error({ err: error }, "contact form failed");
    return { status: "error", error: "generic", values };
  }
}
