import { Container } from "@/components/ui/layout";

/** Fælles ramme for login-siderne: smal kolonne, overskrift og intro. */
export function AuthPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <Container className="flex flex-1 flex-col items-center py-12 sm:py-16">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-card sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {intro ? <p className="mt-2 text-base text-muted">{intro}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </Container>
  );
}
