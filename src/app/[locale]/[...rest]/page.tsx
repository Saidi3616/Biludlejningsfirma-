import { notFound } from "next/navigation";

// Fanger ukendte stier under et sprog, så de får den oversatte 404-side.
export default function CatchAll() {
  notFound();
}
