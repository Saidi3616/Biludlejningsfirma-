import type { Metadata } from "next";
import { privatePage } from "@/lib/seo";

// Personlige sider (login, booking, betaling) skal ikke i søgeresultater.
export const metadata: Metadata = privatePage;

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
