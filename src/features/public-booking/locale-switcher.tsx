import type { SupportedLocale } from "@/i18n/translate";
import { t } from "@/i18n/translate";

/**
 * RU/TG for the customer-facing pages.
 *
 * The choice travels in the query string rather than in a cookie: these pages are opened from signed
 * links sent over SMS and Telegram, often on a phone that has never seen the salon's site, so there
 * is no earlier visit to remember. A link with `?lang=` also survives being forwarded to whoever is
 * actually going to the appointment.
 */
export function LocaleSwitcher({ locale }: { locale: SupportedLocale }) {
  return (
    <nav className="ml-auto flex items-center gap-1 text-xs font-medium" aria-label={t(locale, "booking.languageSwitcherLabel")}>
      <a
        href="?lang=ru"
        aria-current={locale === "ru" ? "true" : undefined}
        className={locale === "ru" ? "text-foreground underline underline-offset-2" : "text-muted-foreground hover:text-foreground"}
      >
        RU
      </a>
      <span className="text-muted-foreground" aria-hidden>
        /
      </span>
      <a
        href="?lang=tg"
        aria-current={locale === "tg" ? "true" : undefined}
        className={locale === "tg" ? "text-foreground underline underline-offset-2" : "text-muted-foreground hover:text-foreground"}
      >
        TG
      </a>
    </nav>
  );
}
