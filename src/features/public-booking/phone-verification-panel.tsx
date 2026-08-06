"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { t, type SupportedLocale } from "@/i18n/translate";
import { Button } from "@/features/ui-kit/button";
import { Field, Input } from "@/features/ui-kit/field";

/**
 * Shown only when the server has refused an action with VERIFICATION_REQUIRED, which is why the panel
 * requests the code itself on mount: the customer has already pressed "book", and making them press a
 * second "send me a code" button first would add a step for no information.
 *
 * Owns the code and its errors so the booking form does not grow a second copy of this state for the
 * waitlist path; the parent only learns the id of a verification that succeeded.
 */
export function PhoneVerificationPanel({
  locale,
  phone,
  purpose = "BOOKING",
  onVerified,
}: {
  locale: SupportedLocale;
  phone: string;
  purpose?: "BOOKING" | "PASSWORD_RESET";
  onVerified: (verificationId: string) => void;
}) {
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const requestedRef = useRef(false);

  const sendCode = useCallback(async () => {
    setError(null);
    setIsSending(true);
    try {
      const response = await fetch("/api/public/phone/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, purpose }),
      });
      const payload = (await response.json()) as { verificationId?: string; error?: string; retryAfterSeconds?: number };
      if (!response.ok || !payload.verificationId) {
        // A cooldown is not a failure: the previous code is still valid, so keep the input usable.
        setError(payload.error === "RESEND_TOO_SOON" ? null : t(locale, "booking.verification.sendFailed"));
        return;
      }
      setVerificationId(payload.verificationId);
    } catch {
      setError(t(locale, "booking.verification.sendFailed"));
    } finally {
      setIsSending(false);
    }
  }, [locale, phone, purpose]);

  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    void sendCode();
  }, [sendCode]);

  async function confirm() {
    if (!verificationId || code.length !== 6) return;
    setError(null);
    setIsConfirming(true);
    try {
      const response = await fetch("/api/public/phone/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verificationId, phone, code }),
      });
      const payload = (await response.json()) as { verified?: boolean; error?: string };
      if (!response.ok || !payload.verified) {
        setError(verifyErrorMessage(locale, payload.error));
        return;
      }
      onVerified(verificationId);
    } catch {
      setError(t(locale, "booking.verification.sendFailed"));
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/30 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{t(locale, "booking.verification.title")}</p>
        <p className="text-[13px] text-muted-foreground">{t(locale, "booking.verification.hint", { phone })}</p>
      </div>
      <Field label={t(locale, "booking.verification.codeLabel")}>
        <Input
          name="phoneVerificationCode"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          disabled={isSending || !verificationId}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        />
      </Field>
      {error ? (
        <p className="text-[13px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={confirm} disabled={isConfirming || isSending || code.length !== 6} loading={isConfirming}>
          {t(locale, "booking.verification.confirmCta")}
        </Button>
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
          disabled={isSending || isConfirming}
          onClick={() => void sendCode()}
        >
          {isSending ? t(locale, "booking.verification.sending") : t(locale, "booking.verification.resendCta")}
        </button>
      </div>
    </div>
  );
}

function verifyErrorMessage(locale: SupportedLocale, code: string | undefined): string {
  if (code === "TOO_MANY_ATTEMPTS") return t(locale, "booking.verification.tooManyAttempts");
  if (code === "EXPIRED" || code === "NOT_FOUND") return t(locale, "booking.verification.expired");
  if (code === "RATE_LIMITED") return t(locale, "booking.errors.rateLimited");
  return t(locale, "booking.verification.invalidCode");
}
