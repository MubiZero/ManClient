"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { formatSomoni } from "@/core/formatting/money";
import { ButtonLink } from "@/features/ui-kit/button";
import { Card, CardContent } from "@/features/ui-kit/card";
import { cn } from "@/features/ui-kit/cn";
import { PublicBrandMark } from "@/features/public-booking/public-brand-mark";
import type { SupportedLocale } from "@/i18n/translate";
import { intlLocale, moneyLocale, t } from "@/i18n/translate";

type PaymentView = {
  amountDiram: number;
  status: string;
  reviewDeadline: Date | string | null;
  booking: {
    status: string;
    expiresAt: Date | string | null;
    startsAt: Date | string;
    customer: { name: string };
    service: { name: string };
    staff: { displayName: string };
    branch: { name: string; timeZone: string };
    promoRedemption?: { discountAppliedDiram: number; promoCode: { code: string } } | null;
  };
  submissions: Array<{ status: string; createdAt: Date | string }>;
  business: { name: string; slug: string; logoStorageKey: string | null; brandColor: string | null };
};

export function PaymentPage({
  token,
  initialPayment,
  paymentUrl,
  locale,
}: {
  token: string;
  initialPayment: PaymentView;
  paymentUrl: string;
  locale: SupportedLocale;
}) {
  const [payment, setPayment] = useState(initialPayment);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const complete = payment.status === "RECEIPT_ACCEPTED" || payment.booking.status === "CONFIRMED";
  const reviewing = ["RECEIPT_PROCESSING", "NEEDS_ATTENTION"].includes(payment.status);
  const rejected = payment.status === "REJECTED";
  const remainingHold = getRemainingHold(payment.booking.expiresAt, now);
  const holdExpired = !complete && !reviewing && (payment.booking.status === "EXPIRED" || remainingHold === 0);

  useEffect(() => {
    if (!reviewing) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/public/payments/${token}`, { cache: "no-store" });
      if (response.ok) setPayment(await response.json() as PaymentView);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [reviewing, token]);

  useEffect(() => {
    if (complete || reviewing || !payment.booking.expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [complete, payment.booking.expiresAt, reviewing]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true); setMessage("");
    const body = new FormData(); body.set("receipt", file);
    try {
      const response = await fetch(`/api/public/payments/${token}/receipt`, { method: "POST", body });
      const result = await response.json() as { status?: string; error?: string };
      if (!response.ok) throw new Error(result.error);
      setPayment((current) => ({ ...current, status: result.status === "ACCEPTED" ? "RECEIPT_ACCEPTED" : result.status === "NEEDS_REVIEW" ? "NEEDS_ATTENTION" : "RECEIPT_PROCESSING" }));
      setMessage(result.status === "ACCEPTED" ? t(locale, "payment.uploadAccepted") : t(locale, "payment.uploadPending"));
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "INVALID_IMAGE"
          ? t(locale, "payment.errors.invalidImage")
          : t(locale, "payment.errors.uploadFailed"),
      );
    } finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  const title = complete
    ? t(locale, "booking.confirmed")
    : reviewing
      ? t(locale, "payment.reviewingTitle")
      : holdExpired
        ? t(locale, "payment.holdExpiredTitle")
        : rejected
          ? t(locale, "payment.rejectedTitle")
          : t(locale, "payment.defaultTitle");

  const brandStyle = payment.business.brandColor
    ? ({ "--color-primary": payment.business.brandColor, "--color-ring": payment.business.brandColor } as CSSProperties)
    : undefined;

  return (
    <main className="flex min-h-screen flex-col bg-secondary/30" style={brandStyle}>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-4">
          <PublicBrandMark slug={payment.business.slug} name={payment.business.name} hasLogo={Boolean(payment.business.logoStorageKey)} href="/" />
          <span className="text-sm font-medium text-muted-foreground">{t(locale, "payment.securePaymentLabel")}</span>
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
        </div>
      </header>
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-8">
        <Card>
          <CardContent className="flex flex-col gap-5 p-6">
            <div>
              <p className="text-sm font-medium text-primary">{payment.booking.branch.name}</p>
              <h1 className="mt-1 text-xl font-bold text-foreground">{title}</h1>
            </div>

            <div className="rounded-md border border-border bg-secondary/40 p-4">
              <strong className="text-sm font-semibold text-foreground">{payment.booking.service.name}</strong>
              <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                <span>{formatVisitDateTime(payment.booking.startsAt, payment.booking.branch.timeZone, locale)} · {payment.booking.staff.displayName}</span>
                <span>{payment.booking.customer.name}</span>
                {payment.booking.promoRedemption ? (
                  <>
                    <span className="line-through">
                      {formatSomoni(
                        payment.amountDiram + payment.booking.promoRedemption.discountAppliedDiram,
                        moneyLocale(locale),
                      )}
                    </span>
                    <span>
                      {t(locale, "payment.promoLine", {
                        code: payment.booking.promoRedemption.promoCode.code,
                        amount: formatSomoni(payment.booking.promoRedemption.discountAppliedDiram, moneyLocale(locale)),
                      })}
                    </span>
                    <span className="font-medium text-foreground">{formatSomoni(payment.amountDiram, moneyLocale(locale))}</span>
                  </>
                ) : (
                  <span className="font-medium text-foreground">{formatSomoni(payment.amountDiram, moneyLocale(locale))}</span>
                )}
              </div>
            </div>

            {complete ? (
              <StatusPanel
                role="status"
                tone="success"
                title={t(locale, "payment.completeTitle")}
                description={t(locale, "payment.completeDescription")}
              />
            ) : reviewing ? (
              <StatusPanel
                role="status"
                tone="info"
                title={t(locale, "payment.reviewingPanelTitle")}
                description={t(locale, "payment.reviewingPanelDescription")}
              />
            ) : holdExpired ? (
              <StatusPanel
                role="alert"
                tone="danger"
                title={t(locale, "payment.holdExpiredPanelTitle")}
                description={t(locale, "payment.holdExpiredPanelDescription")}
              />
            ) : (
              <>
                {remainingHold !== null ? (
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    {t(locale, "payment.timeRemainingLabel")}{" "}
                    <strong className="text-foreground" suppressHydrationWarning>
                      {formatRemainingHold(remainingHold)}
                    </strong>
                  </p>
                ) : null}
                {rejected ? (
                  <StatusPanel
                    role="alert"
                    tone="danger"
                    title={t(locale, "payment.rejectedPanelTitle")}
                    description={t(locale, "payment.rejectedPanelDescription")}
                  />
                ) : null}
                <ol className="list-decimal pl-5 text-sm text-muted-foreground">
                  <li>{t(locale, "payment.steps.pay")}</li>
                  <li>{t(locale, "payment.steps.return")}</li>
                  <li>{t(locale, "payment.steps.attach")}</li>
                </ol>
                <ButtonLink href={paymentUrl} target="_blank" rel="noreferrer" size="lg">
                  {t(locale, "payment.payCta", { amount: formatSomoni(payment.amountDiram, moneyLocale(locale)) })}
                </ButtonLink>
                <label className="flex cursor-pointer flex-col gap-1 rounded-md border border-dashed border-border p-4 text-sm transition-colors hover:border-primary/50">
                  <span className="font-medium text-foreground">
                    {uploading ? t(locale, "payment.checkingImage") : t(locale, "payment.attachReceipt")}
                  </span>
                  <span className="text-xs text-muted-foreground">{t(locale, "payment.fileHint")}</span>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    disabled={uploading}
                    onChange={(event) => void upload(event.target.files?.[0])}
                    className="sr-only"
                  />
                </label>
              </>
            )}
            {message ? (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {message}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <footer className="border-t border-border py-4 text-center text-sm text-muted-foreground">
        {t(locale, "payment.footer")}
      </footer>
    </main>
  );
}

function StatusPanel({
  role,
  tone,
  title,
  description,
}: {
  role: "status" | "alert";
  tone: "success" | "info" | "danger";
  title: string;
  description: string;
}): ReactNode {
  return (
    <div
      role={role}
      className={cn(
        "rounded-md border p-4",
        tone === "success" && "border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-950/40",
        tone === "info" && "border-info-200 bg-info-50 dark:border-info-900 dark:bg-info-500/10",
        tone === "danger" && "border-danger-200 bg-danger-50 dark:border-danger-900 dark:bg-danger-500/10",
      )}
    >
      <strong
        className={cn(
          "text-sm font-semibold",
          tone === "success" && "text-brand-800 dark:text-brand-200",
          tone === "info" && "text-info-800 dark:text-info-300",
          tone === "danger" && "text-danger-800 dark:text-danger-300",
        )}
      >
        {title}
      </strong>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function getRemainingHold(expiresAt: Date | string | null, now: number) {
  if (!expiresAt) return null;
  return Math.max(0, new Date(expiresAt).getTime() - now);
}

function formatRemainingHold(milliseconds: number) {
  const totalSeconds = Math.ceil(milliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatVisitDateTime(value: Date | string, timeZone: string, locale: SupportedLocale) {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
