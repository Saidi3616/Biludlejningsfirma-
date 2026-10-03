"use client";

import { Accordion as AccordionPrimitive } from "radix-ui";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export const Accordion = AccordionPrimitive.Root;

export function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return <AccordionPrimitive.Item className={cn("border-b border-border", className)} {...props} />;
}

export function AccordionTrigger({
  className,
  children,
  headingLevel = 3,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger> & {
  /** Overskriftsniveau, så rækkefølgen passer til siden (fx 2 lige under sidens h1). */
  headingLevel?: 2 | 3 | 4;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <AccordionPrimitive.Header asChild>
      <Heading>
        <AccordionPrimitive.Trigger
          className={cn(
            "group flex w-full cursor-pointer items-center justify-between gap-4 py-4 text-start text-base font-semibold text-ink-900",
            className,
          )}
          {...props}
        >
          {children}
          <ChevronDown
            className="size-5 shrink-0 text-ink-500 transition-transform group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </AccordionPrimitive.Trigger>
      </Heading>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      className={cn("pb-4 text-base text-ink-700", className)}
      {...props}
    />
  );
}
