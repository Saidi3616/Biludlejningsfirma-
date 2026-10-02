"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

type DialogContentProps = React.ComponentProps<typeof DialogPrimitive.Content> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** "modal" = centreret boks. "sheet" = glider op fra bunden (mobil) / ind fra siden (desktop). */
  variant?: "modal" | "sheet";
  closeLabel: string;
};

export function DialogContent({
  title,
  description,
  variant = "modal",
  closeLabel,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-900/50" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-white p-5 shadow-(--shadow-raised) focus:outline-none",
          variant === "modal" &&
            "start-1/2 top-1/2 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-y-1/2 overflow-y-auto rounded-xl ltr:-translate-x-1/2 rtl:translate-x-1/2",
          variant === "sheet" &&
            "inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-xl md:inset-y-0 md:start-auto md:end-0 md:max-h-none md:w-96 md:rounded-none",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="text-lg font-semibold text-ink-900">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-base text-muted">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close
            className="-m-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-600 hover:bg-ink-100"
            aria-label={closeLabel}
          >
            <X className="size-5" aria-hidden />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
