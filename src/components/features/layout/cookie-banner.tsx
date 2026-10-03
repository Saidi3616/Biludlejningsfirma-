"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  parseConsent,
  readConsentCookie,
  serializeConsent,
  type ConsentChoice,
} from "@/lib/consent";

const OPEN_EVENT = "consent:open";
const CHANGE_EVENT = "consent:change";
// Serveren kender ikke cookien og renderer derfor banneret. Har besøgende allerede valgt,
// skjuler consentPrecheckScript det før første visning, og efter hydrering forsvinder det helt.
const SERVER_SNAPSHOT = "server";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/** Knap (fx i footeren), der genåbner samtykke-banneret. */
export function CookieSettingsButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className="cursor-pointer text-base text-ink-700 hover:text-ink-900 hover:underline"
    >
      {label}
    </button>
  );
}

export function CookieBanner() {
  const t = useTranslations("cookies");
  const raw = useSyncExternalStore(subscribe, readConsentCookie, () => SERVER_SNAPSHOT);
  const pending = raw === SERVER_SNAPSHOT;
  const stored = pending ? null : parseConsent(raw);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [choice, setChoice] = useState<ConsentChoice>({ analytics: false, marketing: false });

  useEffect(() => {
    const reopen = () => {
      const current = parseConsent(readConsentCookie());
      if (current) setChoice({ analytics: current.analytics, marketing: current.marketing });
      setSettingsOpen(true);
    };
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);

  function save(next: ConsentChoice) {
    const id = parseConsent(readConsentCookie())?.id ?? crypto.randomUUID();
    document.cookie = serializeConsent(next, new Date(), id);
    // Valget logges som dokumentation; fejler det, gælder valget alligevel.
    fetch("/api/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...next }),
      keepalive: true,
    }).catch(() => {});
    setChoice(next);
    setSettingsOpen(false);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  const open = settingsOpen || stored === null;

  if (!open) return null;

  return (
    <section
      role="dialog"
      aria-labelledby="cookie-title"
      aria-describedby="cookie-body"
      data-consent-pending={pending ? "" : undefined}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white p-4 shadow-(--shadow-raised) sm:inset-x-auto sm:end-4 sm:bottom-4 sm:max-w-md sm:rounded-xl sm:border print:hidden"
    >
      <h2 id="cookie-title" className="text-lg font-semibold text-ink-900">
        {t("title")}
      </h2>
      <p id="cookie-body" className="mt-1 text-base text-ink-700">
        {t("body")}{" "}
        <Link href="/cookies" className="text-brand-700 underline">
          {t("policy")}
        </Link>
      </p>

      {settingsOpen ? (
        <ul className="mt-4 flex flex-col gap-4">
          <ConsentRow title={t("necessary")} description={t("necessaryDescription")}>
            <Switch checked disabled aria-label={t("necessary")} />
          </ConsentRow>
          <ConsentRow title={t("analytics")} description={t("analyticsDescription")}>
            <Switch
              checked={choice.analytics}
              onCheckedChange={(analytics) => setChoice((c) => ({ ...c, analytics }))}
              aria-label={t("analytics")}
            />
          </ConsentRow>
          <ConsentRow title={t("marketing")} description={t("marketingDescription")}>
            <Switch
              checked={choice.marketing}
              onCheckedChange={(marketing) => setChoice((c) => ({ ...c, marketing }))}
              aria-label={t("marketing")}
            />
          </ConsentRow>
        </ul>
      ) : null}

      {/* "Accepter" og "Kun nødvendige" er lige synlige (krav fra Datatilsynet). */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => save({ analytics: false, marketing: false })}>
          {t("necessaryOnly")}
        </Button>
        <Button variant="primary" onClick={() => save({ analytics: true, marketing: true })}>
          {t("acceptAll")}
        </Button>
        {settingsOpen ? (
          <Button variant="ghost" className="col-span-2" onClick={() => save(choice)}>
            {t("save")}
          </Button>
        ) : (
          <Button variant="ghost" className="col-span-2" onClick={() => setSettingsOpen(true)}>
            {t("settings")}
          </Button>
        )}
      </div>
    </section>
  );
}

function ConsentRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start justify-between gap-4">
      <div>
        <p className="font-medium text-ink-900">{title}</p>
        <p className="text-sm text-muted">{description}</p>
      </div>
      {children}
    </li>
  );
}
