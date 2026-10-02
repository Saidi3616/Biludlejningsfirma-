import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap transition-colors duration-(--duration-fast) disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[1.15em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Standardhandling. */
        primary: "bg-brand-700 text-white hover:bg-brand-800",
        /** Den ene vigtigste handling på siden, fx "Find biler" og "Betal". */
        cta: "bg-accent-500 text-accent-950 hover:bg-accent-400",
        secondary:
          "border border-ink-300 bg-white text-ink-900 hover:border-ink-400 hover:bg-ink-50",
        ghost: "text-ink-800 hover:bg-ink-100",
        danger: "bg-danger-600 text-white hover:bg-danger-700",
        whatsapp: "bg-whatsapp text-whatsapp-ink hover:bg-whatsapp-hover",
        link: "h-auto px-0 text-brand-700 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-base",
        lg: "h-14 px-6 text-lg",
        icon: "size-11",
      },
      fullWidth: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render som barnet (fx et <a> eller Link) med knappens udseende. */
    asChild?: boolean;
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  fullWidth,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {/* Slot kræver præcis ét barn, så spinneren findes kun på rigtige knapper. */}
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {children}
        </>
      )}
    </Comp>
  );
}
