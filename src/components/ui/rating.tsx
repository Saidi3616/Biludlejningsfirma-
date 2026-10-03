import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

export function Rating({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  return (
    <span role="img" aria-label={label} className={cn("inline-flex gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn(
            "size-4",
            n <= value ? "fill-accent-500 text-accent-500" : "fill-ink-200 text-ink-200",
          )}
        />
      ))}
    </span>
  );
}
