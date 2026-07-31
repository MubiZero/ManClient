"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { formatSomoni } from "@/core/formatting/money";
import { ButtonLink } from "@/features/ui-kit/button";
import { Card, CardContent } from "@/features/ui-kit/card";
import { cn } from "@/features/ui-kit/cn";

type PaymentView = {
  amountDiram: number;
  status: string;
  reviewDeadline: Date | string | null;
  booking: { status: string; expiresAt: Date | string | null; startsAt: Date | string; customer: { name: string }; service: { name: string }; staff: { displayName: string }; branch: { name: string; timeZone: string } };
  submissions: Array<{ status: string; createdAt: Date | string }>;
};

export function PaymentPage({ token, initialPayment, paymentUrl }: { token: string; initialPayment: PaymentView; paymentUrl: string }) {
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
      setMessage(result.status === "ACCEPTED" ? "Оплата подтверждена. Запись сохранена." : "Чек получен и передан администратору на проверку.");
    } catch (error) {
      setMessage(error instanceof Error && error.message === "INVALID_IMAGE" ? "Нужна фотография чека в JPG, PNG или WebP размером до 10 МБ." : "Не удалось отправить чек. Проверьте соединение и попробуйте ещё раз.");
    } finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  const title = complete
    ? "Запись подтверждена"
    : reviewing
      ? "Чек проверяется"
      : holdExpired
        ? "Время оплаты закончилось"
        : rejected
          ? "Чек отклонён"
          : "Завершите оплату";

  return (
    <main className="flex min-h-screen flex-col bg-secondary/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-4">
          <Link href="/" aria-label="ManClient, главная" className="flex size-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            MC
          </Link>
          <span className="text-sm font-medium text-muted-foreground">Безопасная оплата записи</span>
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
                <span>{formatVisitDateTime(payment.booking.startsAt, payment.booking.branch.timeZone)} · {payment.booking.staff.displayName}</span>
                <span>{payment.booking.customer.name}</span>
                <span className="font-medium text-foreground">{formatSomoni(payment.amountDiram)}</span>
              </div>
            </div>

            {complete ? (
              <StatusPanel role="status" tone="success" title="Всё готово" description="Оплата принята. Бизнес видит подтверждённую запись." />
            ) : reviewing ? (
              <StatusPanel role="status" tone="info" title="Чек уже у бизнеса" description="Можно закрыть страницу. Статус обновится автоматически, а запись удерживается на время проверки." />
            ) : holdExpired ? (
              <StatusPanel role="alert" tone="danger" title="Запись больше не удерживается" description="Выберите новое время и создайте запись заново." />
            ) : (
              <>
                {remainingHold !== null ? (
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    Время для оплаты:{" "}
                    <strong className="text-foreground" suppressHydrationWarning>
                      {formatRemainingHold(remainingHold)}
                    </strong>
                  </p>
                ) : null}
                {rejected ? (
                  <StatusPanel role="alert" tone="danger" title="Нужен другой чек" description="Бизнес не смог подтвердить предыдущий чек. Проверьте оплату и прикрепите корректное изображение." />
                ) : null}
                <ol className="list-decimal pl-5 text-sm text-muted-foreground">
                  <li>Нажмите «Оплатить» и завершите перевод.</li>
                  <li>Вернитесь на эту страницу.</li>
                  <li>Прикрепите изображение чека.</li>
                </ol>
                <ButtonLink href={paymentUrl} target="_blank" rel="noreferrer" size="lg">
                  Оплатить {formatSomoni(payment.amountDiram)}
                </ButtonLink>
                <label className="flex cursor-pointer flex-col gap-1 rounded-md border border-dashed border-border p-4 text-sm transition-colors hover:border-primary/50">
                  <span className="font-medium text-foreground">{uploading ? "Проверяем изображение…" : "Прикрепить чек"}</span>
                  <span className="text-xs text-muted-foreground">JPG, PNG или WebP, до 10 МБ</span>
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
        Оплата поступает напрямую бизнесу
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

function formatVisitDateTime(value: Date | string, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
