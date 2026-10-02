import Link from "next/link";
import "./globals.css";

// Vises kun for stier uden for sprog-routingen. Sprogede 404'er: [locale]/not-found.tsx.
export default function GlobalNotFound() {
  return (
    <html lang="da">
      <body className="flex min-h-dvh items-center justify-center p-4 text-center">
        <div>
          <h1 className="text-2xl font-semibold">404</h1>
          <Link href="/" className="mt-2 inline-block text-brand-700 underline">
            Forside
          </Link>
        </div>
      </body>
    </html>
  );
}
