import { useTranslations } from "next-intl";
import { Briefcase, Cog, DoorOpen, Fuel, Snowflake, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CatalogCar } from "@/server/catalog/service";

type SpecsCar = Pick<
  CatalogCar,
  "seats" | "bags" | "doors" | "transmission" | "fuel" | "airConditioning"
>;

/** Bilens nøgletal med ikoner. `compact` viser kun de vigtigste (til kort). */
export function CarSpecs({
  car,
  compact = false,
  className,
}: {
  car: SpecsCar;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("cars");
  const items = [
    { icon: Users, label: t("specs.seats", { count: car.seats }) },
    { icon: Cog, label: t(`transmissionNames.${car.transmission}`) },
    { icon: Fuel, label: t(`fuelNames.${car.fuel}`) },
    { icon: Briefcase, label: t("specs.bags", { count: car.bags }) },
    ...(compact
      ? []
      : [
          { icon: DoorOpen, label: t("specs.doors", { count: car.doors }) },
          ...(car.airConditioning ? [{ icon: Snowflake, label: t("specs.airConditioning") }] : []),
        ]),
  ];
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink-700", className)}>
      {items.map(({ icon: Icon, label }) => (
        <li key={label} className="inline-flex items-center gap-1.5">
          <Icon className="size-4 text-ink-500" aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
}
