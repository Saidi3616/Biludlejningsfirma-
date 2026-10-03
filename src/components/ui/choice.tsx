import { cn } from "@/lib/cn";

const boxClasses =
  "mt-0.5 size-5 shrink-0 cursor-pointer accent-brand-700 disabled:cursor-not-allowed";

type ChoiceProps = Omit<React.ComponentProps<"input">, "type"> & {
  label: React.ReactNode;
  description?: React.ReactNode;
};

/** Checkbox med label. Hele rækken er klikbar (stort trykområde på mobil). */
export function Checkbox({ label, description, className, ...props }: ChoiceProps) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3", className)}>
      <input type="checkbox" className={boxClasses} {...props} />
      <span className="flex flex-col">
        <span className="text-base text-ink-900">{label}</span>
        {description ? <span className="text-sm text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export function Radio({ label, description, className, ...props }: ChoiceProps) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3", className)}>
      <input type="radio" className={boxClasses} {...props} />
      <span className="flex flex-col">
        <span className="text-base text-ink-900">{label}</span>
        {description ? <span className="text-sm text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export function RadioGroup({
  legend,
  className,
  children,
}: {
  legend: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className={cn("flex flex-col gap-3", className)}>
      <legend className="mb-1 text-sm font-medium text-ink-900">{legend}</legend>
      {children}
    </fieldset>
  );
}
