import "server-only";
import { logger } from "@/lib/logger";
import { contactMessageSchema, type ContactMessageInput } from "@/lib/validation/contact";
import { parseInput } from "@/lib/validation/parse";
import { db } from "@/server/db";
import { assertRateLimit } from "@/server/rate-limit";

/**
 * Gemmer en henvendelse fra kontaktformularen. Den vises i admin (M10), og notifikation til
 * medarbejderne kommer med outboxen (M8). Højst 5 henvendelser pr. IP i timen.
 */
export async function submitContactMessage(
  input: ContactMessageInput,
  context: { ip: string; now?: Date },
) {
  // Robotter, der udfylder det skjulte felt, får et "ok" uden at noget gemmes.
  if (input.website) return null;
  const data = parseInput(contactMessageSchema, input);
  await assertRateLimit("contact", context.ip, { max: 5, windowMs: 60 * 60_000, now: context.now });

  const message = await db.message.create({
    data: {
      direction: "INBOUND",
      channel: "CONTACT_FORM",
      name: data.name,
      email: data.email,
      phone: data.phone,
      subject: data.subject,
      body: data.message,
    },
    select: { id: true },
  });
  // Kun id'et logges; navn, e-mail og besked er persondata.
  logger.info({ messageId: message.id }, "contact message received");
  return message;
}
