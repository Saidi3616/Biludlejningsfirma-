import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/** Trinindikator til bookingflowet. `current` er 0-baseret. */
export function ProgressSteps({
  steps,
  current,
  label,
}: {
  steps: string[];
  current: number;
  label: string;
}) {
  return (
    <nav aria-label={label}>
      <ol className="flex items-center gap-2">
        {steps.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={step} className="flex flex-1 items-center gap-2">
              <span
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold",
                  done && "border-brand-700 bg-brand-700 text-white",
                  active && "border-brand-700 text-brand-700",
                  !done && !active && "border-ink-300 text-ink-500",
                )}
              >
                {done ? <Check className="size-4" aria-hidden /> : index + 1}
              </span>
              {/* Trinnavne skjules på små skærme; det aktive trin vises altid. */}
              <span
                className={cn(
                  "text-sm font-medium",
                  active ? "text-ink-900" : "sr-only text-ink-600 md:not-sr-only",
                )}
              >
                {step}
              </span>
              {index < steps.length - 1 ? (
                <span className="hidden h-px flex-1 bg-ink-200 md:block" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
