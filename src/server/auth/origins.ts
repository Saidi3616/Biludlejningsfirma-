/**
 * Vercels egne adresser for den kørende udgivelse (systemvariabler, sat af Vercel).
 * Login skal virke både på produktionsadressen, grenens adresse og udgivelsens egen
 * adresse, selvom AUTH_URL kun peger på én af dem.
 */
export function vercelOrigins(source: Record<string, string | undefined>): string[] {
  const hosts = [
    source.VERCEL_URL,
    source.VERCEL_BRANCH_URL,
    source.VERCEL_PROJECT_PRODUCTION_URL,
  ].filter((host): host is string => Boolean(host));
  return [...new Set(hosts.map((host) => `https://${host}`))];
}
