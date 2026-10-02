import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { hashManageToken } from "./tokens";

const REFERENCE_PATTERN = /^BK-[2-9A-HJKMNP-Z]{6}$/;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function cookieName(reference: string) {
  return `bk_${reference}`;
}

/**
 * Giver gæsten adgang til betaling og bekræftelse i denne browser: "administrér booking"-tokenet
 * gemmes i en httpOnly-cookie. Kunder med konto genkendes på sessionen og får ingen cookie.
 */
export async function grantBookingAccess(reference: string, manageToken: string | null) {
  if (!manageToken) return;
  (await cookies()).set(cookieName(reference), manageToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * Bookingen, hvis den aktuelle besøgende må se den: ejeren via login eller gæsten via token-cookien.
 * Ellers null (siden viser 404, så referencer ikke kan afprøves).
 */
export async function findAccessibleBooking(reference: string) {
  if (!REFERENCE_PATTERN.test(reference)) return null;
  const booking = await db.booking.findUnique({
    where: { reference },
    select: { id: true, manageTokenHash: true, customer: { select: { userId: true } } },
  });
  if (!booking) return null;

  const token = (await cookies()).get(cookieName(reference))?.value;
  if (token && booking.manageTokenHash && hashManageToken(token) === booking.manageTokenHash) {
    return booking.id;
  }
  if (booking.customer.userId) {
    const user = await getCurrentUser();
    if (user?.userId === booking.customer.userId) return booking.id;
  }
  return null;
}
