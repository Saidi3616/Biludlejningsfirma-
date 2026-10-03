import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { db } from "@/server/db";
import { ADMIN_PAGE_SIZE } from "./bookings";

export const customerFilterSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
});

export type CustomerFilter = z.infer<typeof customerFilterSchema>;

/** Kunder med antal bookinger; søgning på navn, e-mail og telefon. */
export async function listCustomers(ctx: PolicyContext, filter: CustomerFilter) {
  assertCan(ctx, "customer:read");
  const page = filter.page ?? 1;
  const q = filter.q;
  const where: Prisma.CustomerWhereInput = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { phoneE164: { contains: q.replace(/[\s-]/g, "") } },
          {
            AND: q
              .split(/\s+/)
              .filter(Boolean)
              .map((word) => ({
                OR: [
                  { firstName: { contains: word, mode: "insensitive" as const } },
                  { lastName: { contains: word, mode: "insensitive" as const } },
                ],
              })),
          },
        ],
      }
    : {};
  const [rows, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneE164: true,
        userId: true,
        anonymizedAt: true,
        createdAt: true,
        _count: { select: { bookings: true } },
      },
    }),
    db.customer.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
}

export async function adminCustomer(ctx: PolicyContext, id: string) {
  assertCan(ctx, "customer:read");
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND", "Kunden findes ikke");
  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, lastLoginAt: true } },
      bookings: {
        orderBy: { pickupAt: "desc" },
        select: {
          reference: true,
          status: true,
          paymentStatus: true,
          pickupAt: true,
          returnAt: true,
          totalMinor: true,
          currency: true,
          carModel: { select: { brand: true, model: true } },
          pickupLocation: { select: { timezone: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { assignedUser: { select: { name: true } } },
      },
    },
  });
  if (!customer) throw new AppError("NOT_FOUND", "Kunden findes ikke");
  return customer;
}

export type AdminCustomer = Awaited<ReturnType<typeof adminCustomer>>;
