import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Sprogbevidste udgaver af Link, redirect, usePathname og useRouter.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
