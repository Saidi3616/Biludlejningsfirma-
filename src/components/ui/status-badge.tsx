import { useTranslations } from "next-intl";
import { Ban, Car, CheckCircle2, CircleDot, Clock, Wrench, XCircle } from "lucide-react";
import { Badge } from "./badge";
import { statusTone, type BookingStatus, type CarStatus, type PaymentStatus } from "./status";

const toneIcon = {
  neutral: Ban,
  brand: Car,
  success: CheckCircle2,
  warning: Clock,
  danger: XCircle,
  info: CircleDot,
} as const;

type StatusBadgeProps =
  | { kind: "booking"; status: BookingStatus }
  | { kind: "payment"; status: PaymentStatus }
  | { kind: "car"; status: CarStatus };

export function StatusBadge(props: StatusBadgeProps) {
  const t = useTranslations("status");
  // Union-typen (kind, status) er korrekt parret; TS kan blot ikke se det i skabelonstrengen.
  const tone = (statusTone[props.kind] as Record<string, keyof typeof toneIcon>)[props.status];
  const Icon = props.kind === "car" && props.status === "MAINTENANCE" ? Wrench : toneIcon[tone];
  return (
    <Badge tone={tone}>
      <Icon aria-hidden />
      {t(`${props.kind}.${props.status}` as Parameters<typeof t>[0])}
    </Badge>
  );
}
