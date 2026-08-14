"use client";

import { formatLocaleDayMonthTime } from "@/core/formatting/locale-date";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { intlLocale, t, type SupportedLocale } from "@/i18n/translate";
import { Button, ButtonLink } from "@/features/ui-kit/button";

/**
 * The customer's own list. Serialised dates rather than `Date` objects because this crosses the server
 * boundary, and rendered per branch timezone: a salon in another city keeps its own clock, and the
 * time printed here has to be the time the customer will be standing in the door.
 */
export type VisitView = {
  id: string;
  businessName: string;
  businessSlug: string;
  branchName: string;
  timeZone: string;
  serviceName: string;
  staffName: string;
  startsAt: string;
  status: "PENDING_PAYMENT" | "CONFIRMED" | "CANCELLED" | "EXPIRED" | "NO_SHOW";
  canCancel: boolean;
  canReschedule: boolean;
  /** Null when the salon's window has closed, so the button is simply absent rather than dead. */
  rescheduleHref: string | null;
};

export function VisitList({ locale, upcoming, past }: { locale: SupportedLocale; upcoming: VisitView[]; past: VisitView[] }) {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t(locale, "visits.upcomingTitle")}</h2>
        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            {t(locale, "visits.noUpcoming")}
          </p>
        ) : (
          upcoming.map((visit) => <VisitCard key={visit.id} locale={locale} visit={visit} />)
        )}
      </section>

      {past.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t(locale, "visits.pastTitle")}</h2>
          {past.map((visit) => (
            <VisitCard key={visit.id} locale={locale} visit={visit} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function VisitCard({ locale, visit }: { locale: SupportedLocale; visit: VisitView }) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPast = visit.status !== "PENDING_PAYMENT" && visit.status !== "CONFIRMED";

  async function cancel() {
    setError(null);
    setIsCancelling(true);
    try {
      const response = await fetch(`/api/public/customer/visits/${visit.id}/cancel`, { method: "POST" });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(
          payload.error === "CANCELLATION_WINDOW_CLOSED" ? t(locale, "visits.windowClosed") : t(locale, "visits.cancelFailed"),
        );
        return;
      }
      router.refresh();
    } catch {
      setError(t(locale, "visits.cancelFailed"));
    } finally {
      setIsCancelling(false);
      setIsConfirming(false);
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-foreground">{formatVisitDate(visit.startsAt, visit.timeZone, locale)}</p>
        <StatusBadge locale={locale} status={visit.status} />
      </div>
      <div className="flex flex-col gap-0.5 text-sm">
        <p className="text-foreground">{visit.serviceName}</p>
        <p className="text-muted-foreground">
          {visit.businessName} · {visit.branchName} · {visit.staffName}
        </p>
      </div>

      {error ? (
        <p className="text-[13px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {isPast ? (
          <Link
            href={`/b/${visit.businessSlug}`}
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            {t(locale, "visits.bookAgain")}
          </Link>
        ) : null}
        {visit.rescheduleHref ? (
          <ButtonLink href={visit.rescheduleHref} variant="secondary" size="sm">
            {t(locale, "visits.reschedule")}
          </ButtonLink>
        ) : null}
        {visit.canCancel ? (
          isConfirming ? (
            <>
              <Button type="button" variant="destructive" size="sm" onClick={() => void cancel()} loading={isCancelling}>
                {t(locale, "visits.cancelConfirmCta")}
              </Button>
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setIsConfirming(false)}
              >
                {t(locale, "visits.keep")}
              </button>
            </>
          ) : (
            <Button type="button" variant="quiet" size="sm" onClick={() => setIsConfirming(true)}>
              {t(locale, "visits.cancel")}
            </Button>
          )
        ) : null}
      </div>
    </article>
  );
}

function StatusBadge({ locale, status }: { locale: SupportedLocale; status: VisitView["status"] }) {
  const tone =
    status === "CONFIRMED"
      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
      : status === "PENDING_PAYMENT"
        ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        : "bg-secondary text-muted-foreground";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{t(locale, statusKey(status))}</span>;
}

function statusKey(status: VisitView["status"]) {
  return (
    {
      PENDING_PAYMENT: "visits.status.pendingPayment",
      CONFIRMED: "visits.status.confirmed",
      CANCELLED: "visits.status.cancelled",
      EXPIRED: "visits.status.expired",
      NO_SHOW: "visits.status.noShow",
    } as const
  )[status];
}

function formatVisitDate(value: string, timeZone: string, locale: SupportedLocale): string {
  return formatLocaleDayMonthTime(new Date(value), timeZone, locale);
}
