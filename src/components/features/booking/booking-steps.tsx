import { useTranslations } from "next-intl";
import { ProgressSteps } from "@/components/ui/progress-steps";

const steps = ["extras", "details", "payment"] as const;

export function BookingSteps({ current }: { current: (typeof steps)[number] }) {
  const t = useTranslations("booking");
  return (
    <ProgressSteps
      label={t("stepsLabel")}
      steps={steps.map((step) => t(`steps.${step}`))}
      current={steps.indexOf(current)}
    />
  );
}
