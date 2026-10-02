import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Biludlejning",
  description: "Find din bil. Book på få minutter.",
};

// Sprog og RTL styres af [locale]-layoutet fra M1. Indtil da er siden dansk.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="da" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
