import { Geist, IBM_Plex_Sans_Arabic } from "next/font/google";

export const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  // Bruges kun på arabisk. Uden preload henter de andre sprog ikke ~130 KB skrift, de ikke viser.
  preload: false,
});
