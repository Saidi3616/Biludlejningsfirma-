import { redirect } from "next/navigation";

/** Flåden åbner på listen over biler (04-sitemap). */
export default function AdminFleetPage() {
  redirect("/admin/fleet/cars");
}
