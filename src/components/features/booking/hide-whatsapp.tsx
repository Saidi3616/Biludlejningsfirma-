/**
 * Skjuler den flydende WhatsApp-knap i formular-trinene, hvor den ellers dækker felter og "Betal" på mobil
 * (05-user-flows.md). Virker uden JavaScript via CSS :has().
 */
export function HideWhatsAppButton() {
  return <span data-hide-whatsapp hidden />;
}
