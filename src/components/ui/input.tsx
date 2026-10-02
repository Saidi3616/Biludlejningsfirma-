import { cn } from "@/lib/cn";

export const controlClasses =
  "w-full rounded-md border border-ink-300 bg-white px-3 text-base text-ink-900 transition-colors placeholder:text-ink-400 hover:border-ink-400 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500 aria-invalid:border-danger-600";

// Tekststørrelse er altid mindst 16 px, så iOS ikke zoomer ind ved fokus.
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(controlClasses, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(controlClasses, "min-h-28 py-2.5", className)} {...props} />;
}
