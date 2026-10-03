import { z } from "zod";

export const contactMessageSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+\d\s()-]*$/)
    .optional()
    .transform((phone) => phone || null),
  subject: z
    .string()
    .trim()
    .max(150)
    .optional()
    .transform((subject) => subject || null),
  message: z.string().trim().min(10).max(4000),
  /** Skjult felt. Udfyldt = robot. */
  website: z.string().max(0).optional(),
});

export type ContactMessageInput = z.input<typeof contactMessageSchema>;
