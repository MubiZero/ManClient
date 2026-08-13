"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatTajikPhoneInput, normalizeTajikPhone } from "@/core/formatting/tajik-phone";
import { Button } from "@/features/ui-kit/button";
import { Field, Input } from "@/features/ui-kit/field";
import { t, type SupportedLocale } from "@/i18n/translate";

/**
 * How a customer gets in. There is no password and there will never be one: the number is the account,
 * an SMS proves it, and a salon's customer is not going to invent and remember a password to look at
 * two haircuts.
 *
 * Two steps in one component rather than two screens — the phone stays on the page while the code is
 * typed, so a customer who mistyped the number can see it and fix it without starting over.
 */
export function CustomerLoginForm({ locale }: { locale: SupportedLocale }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function sendCode() {
    if (!normalizeTajikPhone(phone)) {
      setError(t(locale, "booking.errors.invalidPhone"));
      return;
    }
    setError(null);
    setIsBusy(true);
    try {
      const response = await fetch("/api/public/customer/login/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const payload = (await response.json()) as { enabled?: boolean; verificationId?: string; error?: string };
      // A cooldown means the previous code is still on its way and still valid, so the code field opens
      // anyway instead of telling the customer off for pressing twice.
      if (payload.error === "RESEND_TOO_SOON" && verificationId) return;
      if (payload.enabled === false) {
        setError(t(locale, "visits.unavailable"));
        return;
      }
      if (!response.ok || !payload.verificationId) {
        setError(requestErrorMessage(locale, payload.error));
        return;
      }
      setVerificationId(payload.verificationId);
    } catch {
      setError(t(locale, "booking.verification.sendFailed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function confirm() {
    if (!verificationId || code.length !== 6) return;
    setError(null);
    setIsBusy(true);
    try {
      const response = await fetch("/api/public/customer/login/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verificationId, phone, code }),
      });
      const payload = (await response.json()) as { phone?: string; error?: string };
      if (!response.ok || !payload.phone) {
        setError(verifyErrorMessage(locale, payload.error));
        return;
      }
      // The cookie is already set; the page is a server component, so the list arrives with the refresh.
      router.refresh();
    } catch {
      setError(t(locale, "booking.verification.sendFailed"));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">{t(locale, "visits.signInTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t(locale, "visits.signInDescription")}</p>
      </div>

      <Field label={t(locale, "booking.phoneLabel")}>
        <Input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+992 90 000 00 00"
          value={phone}
          disabled={isBusy}
          onChange={(event) => {
            setPhone(formatTajikPhoneInput(event.target.value));
            setError(null);
          }}
        />
      </Field>

      {verificationId ? (
        <Field label={t(locale, "booking.verification.codeLabel")} hint={t(locale, "visits.codeHint", { phone })}>
          <Input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            disabled={isBusy}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </Field>
      ) : null}

      {error ? (
        <p className="text-[13px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {verificationId ? (
          <Button type="button" onClick={() => void confirm()} disabled={isBusy || code.length !== 6} loading={isBusy}>
            {t(locale, "visits.signInCta")}
          </Button>
        ) : (
          <Button type="button" onClick={() => void sendCode()} disabled={isBusy} loading={isBusy}>
            {t(locale, "visits.sendCodeCta")}
          </Button>
        )}
        {verificationId ? (
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
            disabled={isBusy}
            onClick={() => void sendCode()}
          >
            {t(locale, "booking.verification.resendCta")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function requestErrorMessage(locale: SupportedLocale, code: string | undefined): string {
  if (code === "INVALID_PHONE" || code === "INVALID_INPUT") return t(locale, "booking.errors.invalidPhone");
  if (code === "RATE_LIMITED" || code === "RESEND_TOO_SOON") return t(locale, "booking.errors.rateLimited");
  return t(locale, "booking.verification.sendFailed");
}

function verifyErrorMessage(locale: SupportedLocale, code: string | undefined): string {
  if (code === "TOO_MANY_ATTEMPTS") return t(locale, "booking.verification.tooManyAttempts");
  if (code === "EXPIRED" || code === "NOT_FOUND") return t(locale, "booking.verification.expired");
  if (code === "RATE_LIMITED") return t(locale, "booking.errors.rateLimited");
  return t(locale, "booking.verification.invalidCode");
}
