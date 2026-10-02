import { useTranslations } from "next-intl";
import { whatsappLink } from "@/config/site";
import { WhatsAppIcon } from "./whatsapp-icon";

/** Fast WhatsApp-knap på mobil (§15). På desktop ligger WhatsApp i navigationen. */
export function WhatsAppFloatingButton() {
  const t = useTranslations("whatsapp");
  // I et landmark, så skærmlæsere kan finde den (axe: region).
  return (
    <aside aria-label="WhatsApp" className="lg:hidden">
      <a
        href={whatsappLink(t("prefill"))}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("floating")}
        className="fixed end-4 bottom-4 z-30 flex size-14 items-center justify-center rounded-full bg-whatsapp text-whatsapp-ink shadow-(--shadow-raised) transition-transform hover:scale-105"
      >
        <WhatsAppIcon className="size-7" />
      </a>
    </aside>
  );
}
