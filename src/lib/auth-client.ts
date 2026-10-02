"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";

/** Browserens adgang til /api/auth. Rolle og adgang afgøres altid på serveren. */
export const authClient = createAuthClient({
  plugins: [
    twoFactorClient(),
    inferAdditionalFields({
      user: {
        role: { type: "string", input: false },
        locale: { type: "string", input: true, required: false },
      },
    }),
  ],
});
