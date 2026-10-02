import { useId } from "react";
import { cn } from "@/lib/cn";

type FieldRenderProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  required?: boolean;
};

type FieldProps = {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  /** Modtager id og ARIA-attributter, så label, hjælpetekst og fejl hænger sammen. */
  children: (props: FieldRenderProps) => React.ReactNode;
};

/** Label + felt + hjælpetekst + fejl. Bruges om alle formularfelter. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink-900">
        {label}
        {required ? (
          <span className="text-danger-600" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        required,
      })}
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
