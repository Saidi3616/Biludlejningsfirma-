import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Sammensæt Tailwind-klasser; senere klasser vinder ved konflikt. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
