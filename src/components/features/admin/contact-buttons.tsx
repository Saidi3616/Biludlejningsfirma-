import { Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/features/layout/whatsapp-icon";

/** Ring, WhatsApp og e-mail til kunden (kerneopgave 4). */
export function ContactButtons({
  phone,
  email,
  whatsappText,
  labels,
}: {
  phone: string | null;
  email: string;
  whatsappText: string;
  labels: { call: string; whatsapp: string; email: string };
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {phone ? (
        <>
          <Button asChild variant="secondary" size="sm">
            <a href={`tel:${phone}`}>
              <Phone aria-hidden />
              {labels.call}
            </a>
          </Button>
          <Button asChild variant="whatsapp" size="sm">
            <a
              href={`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(whatsappText)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsAppIcon />
              {labels.whatsapp}
            </a>
          </Button>
        </>
      ) : null}
      <Button asChild variant="secondary" size="sm">
        <a href={`mailto:${email}`}>
          <Mail aria-hidden />
          {labels.email}
        </a>
      </Button>
    </div>
  );
}
