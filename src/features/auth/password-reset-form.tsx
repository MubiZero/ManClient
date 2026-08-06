"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatTajikPhoneInput, normalizeTajikPhone } from "@/features/onboarding/tajik-phone";
import { Button } from "@/features/ui-kit/button";
import { Field, Input } from "@/features/ui-kit/field";

/**
 * Two steps in one component: ask for the number, then take the code and the new password together.
 * Splitting the second step into "confirm code" and "set password" would mean the code has to survive
 * a second round trip, and it buys nothing — the code is checked server-side either way.
 */
export function PasswordResetForm() {
  const router = useRouter();
  const [phone, setPhone] = useState("+992 ");
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function requestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const normalized = normalizeTajikPhone(phone);
    if (!normalized) {
      setError("Проверьте номер телефона.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });
      const payload = (await response.json()) as { verificationId?: string | null; error?: string; retryAfterSeconds?: number };
      if (!response.ok) {
        setError(requestErrorMessage(payload.error, payload.retryAfterSeconds));
        return;
      }
      // The server answers identically for a number with no account, so the form does too: it moves on
      // to the code step and simply never accepts a code.
      setVerificationId(payload.verificationId ?? "");
      setNotice("Если этот номер привязан к кабинету, мы отправили на него код. Он действует 10 минут.");
    } catch {
      setError("Не удалось отправить код. Попробуйте ещё раз.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const normalized = normalizeTajikPhone(phone);
    if (!normalized || !verificationId) {
      setError("Код больше недействителен. Запросите новый.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verificationId, phone: normalized, code, password }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(confirmErrorMessage(payload.error));
        return;
      }
      router.push("/login?reset=done");
    } catch {
      setError("Не удалось изменить пароль. Попробуйте ещё раз.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (verificationId === null) {
    return (
      <form className="flex flex-col gap-4" onSubmit={requestCode} noValidate>
        <Field label="Номер телефона" hint="Тот, на который зарегистрирован кабинет">
          <Input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            maxLength={17}
            value={phone}
            placeholder="+992 __ ___ __ __"
            onChange={(event) => setPhone(formatTajikPhoneInput(event.target.value))}
          />
        </Field>
        {error ? (
          <p className="text-[13px] text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={isSubmitting} loading={isSubmitting}>
          Получить код
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          <Link className="font-medium text-primary hover:underline" href="/login">
            Вернуться к входу
          </Link>
        </p>
      </form>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={confirmReset} noValidate>
      {notice ? <p className="text-[13px] text-muted-foreground">{notice}</p> : null}
      <Field label="Код из SMS">
        <Input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        />
      </Field>
      <Field label="Новый пароль" hint="Минимум 8 символов">
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      {error ? (
        <p className="text-[13px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={isSubmitting || code.length !== 6} loading={isSubmitting}>
        Сохранить новый пароль
      </Button>
      <button
        type="button"
        className="text-sm text-muted-foreground hover:text-foreground"
        onClick={() => {
          setVerificationId(null);
          setCode("");
          setError(null);
        }}
      >
        Указать другой номер
      </button>
    </form>
  );
}

function requestErrorMessage(code: string | undefined, retryAfterSeconds: number | undefined): string {
  if (code === "RATE_LIMITED") return "Слишком много запросов. Попробуйте позже.";
  if (code === "RESEND_TOO_SOON") return `Код уже отправлен. Повторите через ${retryAfterSeconds ?? 60} с.`;
  if (code === "SMS_FAILED") return "SMS не отправилась. Попробуйте позже или обратитесь в поддержку.";
  if (code === "NOT_CONFIGURED") return "Восстановление по SMS пока недоступно. Обратитесь в поддержку.";
  return "Проверьте номер телефона.";
}

function confirmErrorMessage(code: string | undefined): string {
  if (code === "INVALID_CODE") return "Код не подошёл. Проверьте цифры из SMS.";
  if (code === "TOO_MANY_ATTEMPTS") return "Слишком много попыток. Запросите новый код.";
  if (code === "EXPIRED" || code === "NOT_FOUND") return "Код истёк. Запросите новый.";
  if (code === "WEAK_PASSWORD") return "Пароль должен содержать минимум 8 символов.";
  if (code === "RATE_LIMITED") return "Слишком много попыток. Попробуйте позже.";
  return "Не удалось изменить пароль. Попробуйте ещё раз.";
}
