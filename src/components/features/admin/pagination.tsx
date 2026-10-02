import Link from "next/link";

/** Forrige/næste for adminlister. Filtrene bevares i URL'en. */
export function Pagination({
  page,
  pages,
  path,
  params,
  labels,
}: {
  page: number;
  pages: number;
  path: string;
  params: Record<string, string | undefined>;
  labels: { previous: string; next: string; status: string };
}) {
  if (pages <= 1) return null;
  const href = (target: number) => {
    const query = new URLSearchParams(
      Object.entries({ ...params, page: String(target) }).filter(
        (entry): entry is [string, string] => Boolean(entry[1]),
      ),
    );
    return `${path}?${query}`;
  };
  const linkClass = "rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-ink-50";
  return (
    <nav aria-label={labels.status} className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className={linkClass}>
          {labels.previous}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted">{labels.status}</span>
      {page < pages ? (
        <Link href={href(page + 1)} className={linkClass}>
          {labels.next}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
