import "server-only";
import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

/**
 * Cron-endpoints kaldes af platformens scheduler med `Authorization: Bearer <CRON_SECRET>`.
 * Uden CRON_SECRET er de lukket for alle.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = serverEnv().CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
