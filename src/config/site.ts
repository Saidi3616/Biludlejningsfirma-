/**
 * Firmaoplysninger. Telefon, e-mail og WhatsApp rettes under /admin/settings (getSiteContact i
 * src/server/settings.ts); værdierne her er kun pladsholdere, indtil de er sat.
 */
export const site = {
  name: "Biludlejning",
  phone: "+45 00 00 00 00",
  email: "kontakt@example.com",
  // Kun cifre, med landekode, som wa.me kræver.
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "4500000000",
};

export function whatsappLink(number: string, message?: string): string {
  const base = `https://wa.me/${number}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
