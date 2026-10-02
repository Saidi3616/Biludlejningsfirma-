import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { controlClasses } from "./input";

/**
 * Native <select>: giver telefonens egen vælger på mobil, som er hurtigst
 * og mest tilgængelig. Pilen placeres med logiske egenskaber (virker i RTL).
 */
export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(controlClasses, "h-11 appearance-none pe-10", className)} {...props}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-ink-500"
        aria-hidden
      />
    </div>
  );
}
