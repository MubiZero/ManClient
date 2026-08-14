"use client";

import { brandPalette } from "@/core/branding/brand-palette";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { formatSomoni } from "@/core/formatting/money";
import type { PaymentInstructions } from "@/core/payments/payment-service";
import { Button, ButtonLink } from "@/features/ui-kit/button";
import { Card, CardContent } from "@/features/ui-kit/card";
import { cn } from "@/features/ui-kit/cn";
import { PublicBrandMark } from "@/features/public-booking/public-brand-mark";
import type { SupportedLocale } from "@/i18n/translate";
import { intlLocale, moneyLocale, t } from "@/i18n/translate";

type PaymentView = {
  amountDiram: number;
  totalDiram: number;
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
  /** Why the business turned the last receipt down. Only ever sent while the payment is rejected. */
  reviewReason?: string | null;
};

export function PaymentPage({
  token,
  initialPayment,
  instructions,
  locale,
}: {
  token: string;
  initialPayment: PaymentView;
  /** Absent when nothing is due: a business paid on the premises has no card to transfer to. */
  instructions: PaymentInstructions | null;
  locale: SupportedLocale;
}) {
  const [payment, setPayment] = useState(initialPayment);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [selectedReceipt, setSelectedReceipt] = useState<{ name: string; url: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const complete = payment.status === "RECEIPT_ACCEPTED" || payment.booking.status === "CONFIRMED";
  const prepaymentSkipped = payment.status === "NOT_REQUIRED";
  // What the business collects at the visit: the whole price when no deposit was taken, the remainder
  // when one was. Zero once the price has been transferred in full.
  const balanceDiram = Math.max(0, payment.totalDiram - payment.amountDiram);
  const reviewing = ["RECEIPT_PROCESSING", "NEEDS_ATTENTION"].includes(payment.status);
  const rejected = payment.status === "REJECTED";
  const remainingHold = getRemainingHold(payment.booking.expiresAt, now);
  const holdExpired = !complete && !reviewing && (payment.booking.status === "EXPIRED" || remainingHold === 0);

  /**
   * Polling while a receipt is being checked. It skips a hidden tab and slows down as the wait grows:
   * the four-second beat used to keep running behind a locked screen, and mobile traffic here is
   * expensive enough that a forgotten tab was a real cost to the customer.
   */
  useEffect(() => {
    if (!reviewing) return;
    let delay = 4_000;
    let timer = 0;

    async function poll() {
      if (!document.hidden) {
        const response = await fetch(`/api/public/payments/${token}`, { cache: "no-store" });
        if (response.ok) setPayment(await response.json() as PaymentView);
        delay = Math.min(delay * 1.5, 15_000);
      }
      timer = window.setTimeout(() => void poll(), delay);
    }

    timer = window.setTimeout(() => void poll(), delay);
    return () => window.clearTimeout(timer);
  }, [reviewing, token]);

  /**
   * Coming back from the banking app buys more time. The hold is fifteen minutes and the page itself
   * sends the customer away to pay; counting those minutes against somebody who is obeying us is how
   * a paid-for visit used to be lost at the last step. The server decides how much more, and refuses
   * once the slot has been held as long as it may be.
   */
  useEffect(() => {
    if (complete || reviewing) return;

    async function extendHold() {
      if (document.hidden) return;
      try {
        const response = await fetch(`/api/public/payments/${token}`, { method: "POST", cache: "no-store" });
        if (response.ok) setPayment(await response.json() as PaymentView);
      } catch {
        // Offline on return is common here; the hold simply stays as it was.
      }
    }

    document.addEventListener("visibilitychange", extendHold);
    return () => document.removeEventListener("visibilitychange", extendHold);
  }, [complete, reviewing, token]);

  useEffect(() => {
    if (complete || reviewing || !payment.booking.expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [complete, payment.booking.expiresAt, reviewing]);

  /** The blob URL outlives the render that made it, so it is released by hand, not by the browser. */
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  /**
   * Show the photo back before it is sent. On a mobile connection the upload can take half a minute,
   * and without the file on screen there is nothing to tell the customer whether the camera roll
   * handed anything over — the usual answer being to pick a second photo on top of the first.
   */
  function showSelectedReceipt(file: File) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = URL.createObjectURL(file);
    setSelectedReceipt({ name: file.name, url: previewUrlRef.current });
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    showSelectedReceipt(file);
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
    ? (brandPalette(payment.business.brandColor) as CSSProperties | null) ?? undefined
    : undefined;

  return (
    <main className="flex min-h-screen flex-col bg-secondary/30" style={brandStyle}>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-4">
          <PublicBrandMark slug={payment.business.slug} name={payment.business.name} hasLogo={Boolean(payment.business.logoStorageKey)} href={`/b/${payment.business.slug}`} />
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
                        payment.totalDiram + payment.booking.promoRedemption.discountAppliedDiram,
                        moneyLocale(locale),
                      )}
                    </span>
                    <span>
                      {t(locale, "payment.promoLine", {
                        code: payment.booking.promoRedemption.promoCode.code,
                        amount: formatSomoni(payment.booking.promoRedemption.discountAppliedDiram, moneyLocale(locale)),
                      })}
                    </span>
                    <span className="font-medium text-foreground">{formatSomoni(payment.totalDiram, moneyLocale(locale))}</span>
                  </>
                ) : (
                  <span className="font-medium text-foreground">{formatSomoni(payment.totalDiram, moneyLocale(locale))}</span>
                )}
                {balanceDiram > 0 ? (
                  <span>
                    {payment.amountDiram > 0
                      ? t(locale, "payment.depositLine", { due: formatSomoni(payment.amountDiram, moneyLocale(locale)), balance: formatSomoni(balanceDiram, moneyLocale(locale)) })
                      : t(locale, "payment.onSiteLine", { balance: formatSomoni(balanceDiram, moneyLocale(locale)) })}
                  </span>
                ) : null}
              </div>
            </div>

            {complete ? (
              <StatusPanel
                role="status"
                tone="success"
                title={t(locale, "payment.completeTitle")}
                description={t(locale, prepaymentSkipped ? "payment.notRequiredDescription" : "payment.completeDescription")}
                action={
                  <ButtonLink href={`/my?lang=${locale}`} variant="secondary" size="sm">
                    {t(locale, "visits.linkLabel")}
                  </ButtonLink>
                }
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
                action={
                  <ButtonLink href={`/b/${payment.business.slug}?lang=${locale}`} variant="secondary" size="sm">
                    {t(locale, "visits.bookAgain")}
                  </ButtonLink>
                }
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
                    description={
                      // The business had to write down what was wrong with the receipt before it could
                      // reject it. Without that sentence the customer re-sends the very same photo.
                      payment.reviewReason
                        ? t(locale, "payment.rejectedPanelDescriptionWithReason", { reason: payment.reviewReason })
                        : t(locale, "payment.rejectedPanelDescription")
                    }
                    action={
                      <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
                        {t(locale, "payment.rejectedCta")}
                      </Button>
                    }
                  />
                ) : null}
                <ol className="list-decimal pl-5 text-sm text-muted-foreground">
                  <li>{t(locale, "payment.steps.pay")}</li>
                  <li>{t(locale, "payment.steps.return")}</li>
                  <li>{t(locale, "payment.steps.attach")}</li>
                </ol>
                {instructions ? (
                  <div className="flex flex-col gap-3 rounded-md border border-border bg-secondary/40 p-4">
                    <CopyRow
                      label={t(locale, "payment.cardLabel")}
                      value={instructions.cardNumber}
                      display={groupCardNumber(instructions.cardNumber)}
                      copyLabel={t(locale, "payment.copy")}
                      copiedLabel={t(locale, "payment.copied")}
                    />
                    <CopyRow
                      label={t(locale, "payment.amountLabel")}
                      value={(payment.amountDiram / 100).toFixed(2)}
                      display={formatSomoni(payment.amountDiram, moneyLocale(locale))}
                      copyLabel={t(locale, "payment.copy")}
                      copiedLabel={t(locale, "payment.copied")}
                    />
                    <CopyRow
                      label={t(locale, "payment.referenceLabel")}
                      value={instructions.reference}
                      display={instructions.reference}
                      copyLabel={t(locale, "payment.copy")}
                      copiedLabel={t(locale, "payment.copied")}
                    />
                    <p className="text-xs text-muted-foreground">{t(locale, "payment.transferHint")}</p>
                  </div>
                ) : null}
                {instructions ? (
                  <ButtonLink href={instructions.url} target="_blank" rel="noreferrer" size="lg">
                    {t(locale, "payment.payCta", { amount: formatSomoni(payment.amountDiram, moneyLocale(locale)) })}
                  </ButtonLink>
                ) : null}
                <label className="flex cursor-pointer flex-col gap-1 rounded-md border border-dashed border-border p-4 text-sm transition-colors hover:border-primary/50">
                  <span className="font-medium text-foreground">
                    {uploading ? t(locale, "payment.checkingImage") : t(locale, "payment.attachReceipt")}
                  </span>
                  <span className="text-xs text-muted-foreground">{t(locale, "payment.fileHint")}</span>
                  {selectedReceipt ? (
                    <span className="mt-1 flex items-center gap-3">
                      <img
                        src={selectedReceipt.url}
                        alt={t(locale, "payment.receiptPreviewAlt")}
                        className="size-12 shrink-0 rounded-md border border-border object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{selectedReceipt.name}</span>
                      {uploading ? (
                        <span
                          className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
                          aria-hidden
                        />
                      ) : null}
                    </span>
                  ) : null}
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
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

/**
 * A finished state always offers the next step. Each of these panels used to end the page: the
 * customer who lost the hold was told to book again with nothing to press, and the one who had just
 * paid was left on a dead screen. The action slot is what keeps them inside the product.
 */
function StatusPanel({
  role,
  tone,
  title,
  description,
  action,
}: {
  role: "status" | "alert";
  tone: "success" | "info" | "danger";
  title: string;
  description: string;
  action?: ReactNode;
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
      {action ? <div className="mt-3">{action}</div> : null}
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

/**
 * One line of transfer details with a copy button. Copying matters more than it looks: the customer
 * is about to leave for a banking app, and a sixteen-digit number retyped from memory is the most
 * common way a transfer lands on the wrong card.
 */
function CopyRow({
  label,
  value,
  display,
  copyLabel,
  copiedLabel,
}: {
  label: string;
  value: string;
  display: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Older Android browsers and insecure origins have no clipboard; the number is on screen
      // anyway, so a failed copy is not worth an error message.
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-base font-semibold tabular-nums text-foreground">{display}</p>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={() => void copy()}>
        {copied ? copiedLabel : copyLabel}
      </Button>
    </div>
  );
}

/** 1111 2222 3333 4444 — grouped so it can be read off the screen and typed without losing place. */
function groupCardNumber(cardNumber: string): string {
  return cardNumber.replace(/(.{4})/g, "$1 ").trim();
}
