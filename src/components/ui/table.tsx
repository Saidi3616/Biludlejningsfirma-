import { cn } from "@/lib/cn";

/**
 * Tabel der kan scrolle vandret på små skærme i stedet for at sprænge layoutet.
 * Scroll-området kan fokuseres, så tastaturbrugere også kan scrolle det.
 */
export function Table({
  className,
  label,
  ...props
}: React.ComponentProps<"table"> & { label: string }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="w-full overflow-x-auto rounded-lg border border-border"
    >
      <table className={cn("w-full border-collapse text-start text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("bg-ink-50", className)} {...props} />;
}

export function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-b border-border last:border-0", className)} {...props} />;
}

export function TH({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn("px-4 py-3 text-start font-semibold whitespace-nowrap text-ink-700", className)}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 text-ink-900", className)} {...props} />;
}
