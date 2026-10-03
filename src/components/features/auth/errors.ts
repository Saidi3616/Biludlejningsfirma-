/** Oversætter Better Auths fejlkoder til nøgler under `auth.errors`. */
export type AuthErrorKey =
  | "invalidCredentials"
  | "emailNotVerified"
  | "rateLimited"
  | "accountDisabled"
  | "invalidCode"
  | "invalidToken"
  | "passwordTooShort"
  | "generic";

export function authErrorKey(error: { code?: string; status?: number } | null): AuthErrorKey {
  if (!error) return "generic";
  if (error.status === 429) return "rateLimited";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_PASSWORD":
      return "invalidCredentials";
    case "EMAIL_NOT_VERIFIED":
      return "emailNotVerified";
    case "ACCOUNT_DISABLED":
      return "accountDisabled";
    case "INVALID_CODE":
    case "INVALID_BACKUP_CODE":
    case "OTP_HAS_EXPIRED":
    case "INVALID_TWO_FACTOR_COOKIE":
      return "invalidCode";
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return "rateLimited";
    case "INVALID_TOKEN":
    case "TOKEN_EXPIRED":
      return "invalidToken";
    case "PASSWORD_TOO_SHORT":
      return "passwordTooShort";
    default:
      return "generic";
  }
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
