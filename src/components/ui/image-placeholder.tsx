import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Pladsholder for et billede, der endnu ikke findes (§53). Beskriver præcis
 * hvilket billede der skal produceres, så fotografen kan levere det.
 */
export function ImagePlaceholder({
  subject,
  format,
  ratio,
  className,
}: {
  /** Motiv, fx "Premium black SUV, Copenhagen city background". */
  subject: string;
  /** Fx "professional automotive photography". */
  format: string;
  /** CSS aspect-ratio, fx "16/9". */
  ratio: string;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={subject}
      style={{ aspectRatio: ratio }}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed border-brand-300 bg-brand-50 p-4 text-center text-brand-800",
        className,
      )}
    >
      <ImageIcon className="size-8 opacity-60" aria-hidden />
      <p className="max-w-md text-sm font-medium">{subject}</p>
      <p className="text-xs opacity-80">
        {format} · {ratio.replace("/", ":")}
      </p>
    </div>
  );
}
