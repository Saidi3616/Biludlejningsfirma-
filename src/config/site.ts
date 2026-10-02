/**
 * Firmaoplysninger. Mangler fra virksomheden (docs/architecture/14-manglende-info.md, punkt 1)
 * og flyttes til databasen/admin-indstillinger senere. Indtil da er værdierne pladsholdere.
 */
export const site = {
  name: "Biludlejning",
  phone: "+45 00 00 00 00",
  email: "kontakt@example.com",
  // Kun cifre, med landekode, som wa.me kræver.
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "4500000000",
};

export function whatsappLink(message?: string): string {
  const base = `https://wa.me/${site.whatsappNumber}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
