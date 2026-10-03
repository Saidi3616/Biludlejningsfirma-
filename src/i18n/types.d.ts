import type { routing } from "./routing";
import type messages from "../../messages/da.json";

// Typesikre oversættelsesnøgler: en manglende eller forkert nøgle er en compile-fejl.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
