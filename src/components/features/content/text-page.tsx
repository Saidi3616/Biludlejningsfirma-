import { Alert } from "@/components/ui/alert";
import { Container } from "@/components/ui/layout";

type Section = { title: string; body: string };

/** Enkel tekstside (om os, vilkår, privatliv). Teksterne ligger i messages/*.json. */
export function TextPage({
  title,
  description,
  sections,
  notice,
  children,
}: {
  title: string;
  description: string;
  sections: Section[];
  /** Fx "Udkast: skal godkendes" på juridiske sider. */
  notice?: string;
  children?: React.ReactNode;
}) {
  return (
    <Container className="flex max-w-3xl flex-col gap-8 py-12">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">{title}</h1>
        <p className="text-lg text-muted">{description}</p>
      </header>
      {notice ? <Alert tone="warning">{notice}</Alert> : null}
      {sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-ink-900">{section.title}</h2>
          <p className="text-base leading-relaxed text-ink-700">{section.body}</p>
        </section>
      ))}
      {children}
    </Container>
  );
}
