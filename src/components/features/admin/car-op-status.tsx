import { getTranslations } from "next-intl/server";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { CarOpStatus } from "@/generated/prisma/enums";

const tone: Record<CarOpStatus, BadgeTone> = {
  ACTIVE: "success",
  INSPECTION: "warning",
  MAINTENANCE: "danger",
  OUT_OF_SERVICE: "neutral",
  RETIRED: "neutral",
};

/** Bilens driftsstatus, som personalet sætter. Kun "I drift" kan bookes. */
export async function CarOpStatusBadge({ status }: { status: CarOpStatus }) {
  const t = await getTranslations("admin.fleet.opStatus");
  return <Badge tone={tone[status]}>{t(status)}</Badge>;
}
