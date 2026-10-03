import { z } from "zod";

/** Roller, en medarbejder kan have. Kunder oprettes aldrig her. */
export const staffRoles = ["STAFF", "MANAGER", "SUPER_ADMIN"] as const;
export type StaffRole = (typeof staffRoles)[number];

/** Invitation af en medarbejder (F11). */
export const inviteSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  role: z.enum(staffRoles),
});

export type InviteField = keyof z.input<typeof inviteSchema>;

export const roleSchema = z.object({ role: z.enum(staffRoles) });
