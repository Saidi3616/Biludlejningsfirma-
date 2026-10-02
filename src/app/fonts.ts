import { Geist, IBM_Plex_Sans_Arabic } from "next/font/google";

export const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
});
