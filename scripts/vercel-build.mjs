// Build-kommando på Vercel (se vercel.json): opretter/opdaterer databasetabellerne,
// lægger demo-data i en tom database uden for produktion og bygger derefter appen.
import { execSync } from "node:child_process";
import { verifyPassword } from "better-auth/crypto";
import pg from "pg";

const run = (command, env = process.env) => execSync(command, { stdio: "inherit", env });

const missing = ["DATABASE_URL", "AUTH_SECRET"].filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(
    `Mangler i Vercel (Settings → Environment Variables): ${missing.join(", ")}. ` +
      "DATABASE_URL sættes automatisk, når en database forbindes under Storage.",
  );
  process.exit(1);
}

// Neon via Vercel sætter også en direkte forbindelse; migrationer virker ikke gennem poolen.
const directUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
run("pnpm exec prisma migrate deploy", { ...process.env, DATABASE_URL: directUrl });

if (process.env.APP_ENV !== "production") {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM "Location"');
  // Demo-admin uden adgangskode, eller SEED_ADMIN_PASSWORD er ændret siden sidste seed.
  const { rows: login } = await client.query(
    `SELECT a.password FROM "User" u JOIN "Account" a
       ON a."userId" = u.id AND a."providerId" = 'credential'
     WHERE u.email = 'admin@example.com'`,
  );
  await client.end();
  const password = process.env.SEED_ADMIN_PASSWORD;
  // Kun når det er nødvendigt: seed overskriver ellers ændringer, der er lavet i admin.
  const needsLogin =
    Boolean(password) &&
    !(login[0]?.password && (await verifyPassword({ hash: login[0].password, password })));
  if (!password) console.log("Demo-login: SEED_ADMIN_PASSWORD findes ikke i dette miljø.");
  else if (needsLogin) console.log("Demo-login: adgangskoden sættes fra SEED_ADMIN_PASSWORD.");
  else console.log("Demo-login: adgangskoden passer allerede med SEED_ADMIN_PASSWORD.");
  if (rows[0].count === 0 || needsLogin) run("pnpm exec prisma db seed");
}

run("pnpm exec next build");
