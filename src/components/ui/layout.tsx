import { cn } from "@/lib/cn";

/** Sidebredde med 16 px kant på mobil. */
export function Container({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)} {...props} />
  );
}

export function Section({
  className,
  title,
  description,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & {
  title?: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <section className={cn("py-12 sm:py-16", className)} {...props}>
      <Container>
        {title ? (
          <div className="mb-8 flex max-w-2xl flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
              {title}
            </h2>
            {description ? <p className="text-lg text-muted">{description}</p> : null}
          </div>
        ) : null}
        {children}
      </Container>
    </section>
  );
}
