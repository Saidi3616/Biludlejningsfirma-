import { jsonLd } from "@/lib/seo";

/** Strukturerede data til søgemaskiner (schema.org). */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}
