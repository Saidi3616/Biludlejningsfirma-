import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";

/** Syn, service eller forsikring, der er overskredet eller snart skal klares. */
export async function CarWarnings({
  warnings,
}: {
  warnings: ("inspection" | "service" | "insurance")[];
}) {
  if (warnings.length === 0) return null;
  const t = await getTranslations("admin.fleet.warnings");
  return (
    <span className="flex flex-wrap gap-1">
      {warnings.map((warning) => (
        <Badge key={warning} tone="warning">
          {t(warning)}
        </Badge>
      ))}
    </span>
  );
}
