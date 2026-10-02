import Image from "next/image";

/** Private fotos i admin. Klik åbner billedet i fuld størrelse i en ny fane. */
export function PhotoGrid({
  photos,
  alt,
  empty,
}: {
  photos: { id: string }[];
  /** Tekst pr. foto, fx "Foto 2". */
  alt: (index: number) => string;
  empty: string;
}) {
  if (photos.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo, index) => (
        <li key={photo.id}>
          <a
            href={`/admin/files/${photo.id}`}
            target="_blank"
            rel="noopener"
            className="relative block aspect-[4/3] overflow-hidden rounded-md border border-border bg-ink-50 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none"
          >
            <Image
              src={`/admin/files/${photo.id}`}
              alt={alt(index + 1)}
              fill
              unoptimized
              sizes="(min-width: 1024px) 25vw, 50vw"
              className="object-cover"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
