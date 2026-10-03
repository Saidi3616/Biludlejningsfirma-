// Den egentlige root-layout ligger i [locale]/layout.tsx (sætter lang og dir).
// Denne fil sender bare videre, så /api og senere /admin kan have deres egne.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
