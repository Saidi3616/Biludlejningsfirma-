import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

const alertVariants = cva("flex gap-3 rounded-md border p-4 text-base", {
  variants: {
    tone: {
      info: "border-info-700/20 bg-info-50 text-ink-900 [&_svg]:text-info-700",
      success: "border-success-700/20 bg-success-50 text-ink-900 [&_svg]:text-success-700",
      warning: "border-warning-700/20 bg-warning-50 text-ink-900 [&_svg]:text-warning-700",
      danger: "border-danger-700/20 bg-danger-50 text-ink-900 [&_svg]:text-danger-700",
    },
  },
  defaultVariants: { tone: "info" },
});

const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };

type AlertProps = Omit<React.ComponentProps<"div">, "title"> &
  VariantProps<typeof alertVariants> & { title?: React.ReactNode };

export function Alert({ tone = "info", title, className, children, ...props }: AlertProps) {
  const Icon = icons[tone ?? "info"];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="flex flex-col gap-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-ink-700">{children}</div> : null}
      </div>
    </div>
  );
}
