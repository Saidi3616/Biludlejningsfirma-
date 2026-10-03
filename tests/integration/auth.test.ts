import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAuth } from "@/server/auth/auth";
import { db } from "@/server/db";
import { captureEmails, type Email } from "@/server/email/send";
import { totp } from "../support/totp";
import { resetDb } from "./helpers";

const BASE = "http://localhost:3000";
let outbox: Email[];
let ipCounter = 0;

/** Ny IP pr. test, så rate limiting kun rammer de tests, der tester den. */
function nextIp() {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

async function call(
  path: string,
  options: { body?: unknown; cookie?: string; ip?: string; method?: string } = {},
) {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  return getAuth().handler(
    new Request(`${BASE}/api/auth${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        origin: BASE,
        "x-forwarded-for": options.ip ?? nextIp(),
        ...(options.cookie ? { cookie: options.cookie } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
  );
}

function cookiesFrom(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function currentUser(cookie: string) {
  const session = await getAuth().api.getSession({ headers: new Headers({ cookie }) });
  return session?.user ?? null;
}

function linkIn(email: Email) {
  const match = email.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error("Intet link i e-mailen");
  return match[0];
}

const password = "korrekt-hest-batteri";

async function signUp(email = "kunde@example.com", extra: Record<string, unknown> = {}) {
  return call("/sign-up/email", { body: { name: "Kunde Test", email, password, ...extra } });
}

async function signUpAndVerify(email = "kunde@example.com") {
  await signUp(email);
  const verification = outbox.find((m) => m.to === email && m.subject === "Bekræft din e-mail");
  const url = new URL(linkIn(verification!));
  const response = await call(url.pathname.replace("/api/auth", "") + url.search);
  expect(response.status).toBe(302);
}

async function signIn(email: string, pass = password, ip?: string) {
  return call("/sign-in/email", { body: { email, password: pass }, ip });
}

beforeAll(() => {
  outbox = captureEmails();
});

beforeEach(async () => {
  await resetDb();
  outbox.length = 0;
});

describe("tilmelding og e-mailverifikation", () => {
  it("ny bruger er altid kunde og skal bekræfte e-mail før login", async () => {
    const response = await signUp();
    expect(response.status).toBe(200);

    const user = await db.user.findUniqueOrThrow({ where: { email: "kunde@example.com" } });
    expect(user.role).toBe("CUSTOMER");
    expect(user.emailVerified).toBe(false);

    const login = await signIn("kunde@example.com");
    expect(login.status).toBe(403);
    expect((await login.json()).code).toBe("EMAIL_NOT_VERIFIED");

    const verification = outbox.find((m) => m.subject === "Bekræft din e-mail");
    expect(verification?.to).toBe("kunde@example.com");
  });

  it("brugeren kan ikke selv vælge en rolle ved tilmelding", async () => {
    const response = await signUp("hacker@example.com", { role: "SUPER_ADMIN" });
    const user = await db.user.findUnique({ where: { email: "hacker@example.com" } });
    // Enten afvises feltet, eller også ignoreres det. Aldrig en admin.
    if (response.status === 200) expect(user?.role).toBe("CUSTOMER");
    else expect(user).toBeNull();
    expect(await db.user.count({ where: { role: { not: "CUSTOMER" } } })).toBe(0);
  });

  it("e-mails gemmes med små bogstaver", async () => {
    await signUp("Kunde.Stor@Example.com");
    expect(await db.user.count({ where: { email: "kunde.stor@example.com" } })).toBe(1);
  });

  it("e-mailen sendes på brugerens sprog", async () => {
    await signUp("en@example.com", { locale: "en" });
    expect(outbox.at(-1)?.subject).toBe("Confirm your email");
    await signUp("ukendt@example.com", { locale: "xx" });
    const user = await db.user.findUniqueOrThrow({ where: { email: "ukendt@example.com" } });
    expect(user.locale).toBe("da");
  });

  it("link i e-mailen bekræfter e-mailen, og så virker login", async () => {
    await signUpAndVerify();
    const user = await db.user.findUniqueOrThrow({ where: { email: "kunde@example.com" } });
    expect(user.emailVerified).toBe(true);

    const login = await signIn("kunde@example.com");
    expect(login.status).toBe(200);
    const me = await currentUser(cookiesFrom(login));
    expect(me?.email).toBe("kunde@example.com");
    expect(me?.role).toBe("CUSTOMER");

    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.lastLoginAt).not.toBeNull();
  });

  it("tilmelding med en eksisterende e-mail afslører ikke, at kontoen findes", async () => {
    const first = await signUp();
    const second = await signUp();
    expect(second.status).toBe(first.status);
    expect(await db.user.count()).toBe(1);
    expect(outbox.some((m) => m.subject === "Du har allerede en konto")).toBe(true);
  });

  it("password skal være mindst 10 tegn", async () => {
    const response = await call("/sign-up/email", {
      body: { name: "Kort", email: "kort@example.com", password: "123456789" },
    });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("PASSWORD_TOO_SHORT");
  });

  it("passwordet gemmes kun som hash", async () => {
    await signUp();
    const account = await db.account.findFirstOrThrow({ where: { providerId: "credential" } });
    expect(account.password).not.toContain(password);
    expect(account.password?.length).toBeGreaterThan(40);
  });
});

describe("login", () => {
  it("forkert password giver en generel fejl", async () => {
    await signUpAndVerify();
    const login = await signIn("kunde@example.com", "forkert-password");
    expect(login.status).toBe(401);
    expect((await login.json()).code).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  it("deaktiverede brugere kan ikke logge ind", async () => {
    await signUpAndVerify();
    await db.user.update({
      where: { email: "kunde@example.com" },
      data: { disabledAt: new Date() },
    });
    const login = await signIn("kunde@example.com");
    expect(login.status).toBe(403);
    expect((await login.json()).code).toBe("ACCOUNT_DISABLED");
  });

  it("log ud fjerner sessionen", async () => {
    await signUpAndVerify();
    const cookie = cookiesFrom(await signIn("kunde@example.com"));
    expect(await currentUser(cookie)).not.toBeNull();
    await call("/sign-out", { body: {}, cookie });
    expect(await currentUser(cookie)).toBeNull();
  });

  it("rate limiting: 6. loginforsøg fra samme IP inden for et minut afvises", async () => {
    const ip = "203.0.113.7";
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await signIn("findes-ikke@example.com", "forkert-password", ip)).status);
    }
    expect(statuses.slice(0, 5).every((status) => status === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
    // En anden IP er ikke ramt.
    expect((await signIn("findes-ikke@example.com", "forkert-password")).status).toBe(401);
  });
});

describe("nulstil password", () => {
  it("link i e-mailen sætter nyt password og logger ud alle steder", async () => {
    await signUpAndVerify();
    const oldCookie = cookiesFrom(await signIn("kunde@example.com"));

    const request = await call("/request-password-reset", { body: { email: "kunde@example.com" } });
    expect(request.status).toBe(200);
    const resetMail = outbox.find((m) => m.subject === "Nulstil dit password");
    const link = linkIn(resetMail!);
    expect(link).toMatch(/^http:\/\/localhost:3000\/reset-password\/[\w-]+$/);
    const token = link.split("/").at(-1)!;

    const newPassword = "nyt-password-12345";
    const reset = await call("/reset-password", { body: { newPassword, token } });
    expect(reset.status).toBe(200);

    expect(await currentUser(oldCookie)).toBeNull();
    expect((await signIn("kunde@example.com")).status).toBe(401);
    expect((await signIn("kunde@example.com", newPassword)).status).toBe(200);

    // Linket kan kun bruges én gang.
    const again = await call("/reset-password", {
      body: { newPassword: "andet-password-1", token },
    });
    expect(again.status).toBe(400);
  });

  it("ukendt e-mail giver samme svar og sender intet", async () => {
    const request = await call("/request-password-reset", { body: { email: "ingen@example.com" } });
    expect(request.status).toBe(200);
    expect(outbox).toHaveLength(0);
  });
});

describe("medarbejdere", () => {
  it("rolle og 2FA-status følger med sessionen", async () => {
    await signUpAndVerify("leder@example.com");
    await db.user.update({ where: { email: "leder@example.com" }, data: { role: "MANAGER" } });
    const cookie = cookiesFrom(await signIn("leder@example.com"));
    const me = await currentUser(cookie);
    expect(me?.role).toBe("MANAGER");
    expect(me?.twoFactorEnabled).toBe(false);
  });

  it("2FA: når det er slået til, kræver login en kode fra appen", async () => {
    await signUpAndVerify("admin2@example.com");
    await db.user.update({ where: { email: "admin2@example.com" }, data: { role: "SUPER_ADMIN" } });
    const cookie = cookiesFrom(await signIn("admin2@example.com"));

    const enable = await call("/two-factor/enable", { body: { password, method: "totp" }, cookie });
    expect(enable.status).toBe(200);
    const { totpURI, backupCodes } = await enable.json();
    const secret = new URL(totpURI).searchParams.get("secret")!;
    expect(backupCodes).toHaveLength(10);

    // Først aktiv, når koden er bekræftet.
    expect((await currentUser(cookie))?.twoFactorEnabled).toBe(false);
    const confirm = await call("/two-factor/verify-totp", { body: { code: totp(secret) }, cookie });
    expect(confirm.status).toBe(200);
    expect((await currentUser(cookiesFrom(confirm)))?.twoFactorEnabled).toBe(true);

    // Nyt login: password alene giver ingen session, kun en 2FA-udfordring.
    const login = await signIn("admin2@example.com");
    expect(login.status).toBe(200);
    expect((await login.clone().json()).twoFactorRedirect).toBe(true);
    const challenge = cookiesFrom(login);
    expect(await currentUser(challenge)).toBeNull();

    const wrong = await call("/two-factor/verify-totp", {
      body: { code: "000000" },
      cookie: challenge,
    });
    expect(wrong.status).toBe(401);

    const verified = await call("/two-factor/verify-totp", {
      body: { code: totp(secret) },
      cookie: challenge,
    });
    expect(verified.status).toBe(200);
    expect((await currentUser(cookiesFrom(verified)))?.email).toBe("admin2@example.com");

    // Hemmeligheden ligger ikke i klartekst i databasen.
    const stored = await db.twoFactor.findFirstOrThrow();
    expect(stored.secret).not.toBe(secret);
  });
});
