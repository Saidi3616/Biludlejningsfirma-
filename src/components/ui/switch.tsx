"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full bg-ink-300 transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-brand-700",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-5.5 rtl:-translate-x-0.5 rtl:data-[state=checked]:-translate-x-5.5" />
    </SwitchPrimitive.Root>
  );
}
