import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("animate-pulse rounded-md bg-ink-100", className)} aria-hidden {...props} />
  );
}

export function Spinner({ label, className }: { label: string; className?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-muted", className)}>
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed border-ink-300 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? <div className="text-ink-400 [&_svg]:size-10">{icon}</div> : null}
      <p className="text-lg font-semibold text-ink-900">{title}</p>
      {description ? <p className="max-w-sm text-base text-muted">{description}</p> : null}
      {action}
    </div>
  );
}
