"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { formatSomoni } from "@/core/formatting/money";

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

  return <main className="payment-page"><header className="public-header"><Link className="brand" href="/">MC</Link><span>Безопасная оплата записи</span></header><section className="payment-card">
    <p className="context-label">{payment.booking.branch.name}</p><h1>{complete ? "Запись подтверждена" : reviewing ? "Чек проверяется" : holdExpired ? "Время оплаты закончилось" : rejected ? "Чек отклонён" : "Завершите оплату"}</h1>
    <div className="payment-summary"><strong>{payment.booking.service.name}</strong><div className="payment-summary-details"><span>{formatVisitDateTime(payment.booking.startsAt, payment.booking.branch.timeZone)} · {payment.booking.staff.displayName}</span><span>{payment.booking.customer.name}</span><span>{formatSomoni(payment.amountDiram)}</span></div></div>
    {complete ? <div className="success-panel" role="status"><strong>Всё готово</strong><p>Оплата принята. Бизнес видит подтверждённую запись.</p></div> : reviewing ? <div className="review-panel" role="status"><strong>Чек уже у бизнеса</strong><p>Можно закрыть страницу. Статус обновится автоматически, а запись удерживается на время проверки.</p></div> : holdExpired ? <div className="review-panel" role="alert"><strong>Запись больше не удерживается</strong><p>Выберите новое время и создайте запись заново.</p></div> : <>
      {remainingHold !== null ? <p className="payment-hold" aria-live="polite">Время для оплаты: <strong suppressHydrationWarning>{formatRemainingHold(remainingHold)}</strong></p> : null}
      {rejected ? <div className="review-panel" role="alert"><strong>Нужен другой чек</strong><p>Бизнес не смог подтвердить предыдущий чек. Проверьте оплату и прикрепите корректное изображение.</p></div> : null}
      <ol className="payment-steps"><li>Нажмите «Оплатить» и завершите перевод.</li><li>Вернитесь на эту страницу.</li><li>Прикрепите изображение чека.</li></ol>
      <a className="primary-link" href={paymentUrl} target="_blank" rel="noreferrer">Оплатить {formatSomoni(payment.amountDiram)}</a>
      <label className="receipt-upload"><span>{uploading ? "Проверяем изображение…" : "Прикрепить чек"}</span><small>JPG, PNG или WebP, до 10 МБ</small><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={uploading} onChange={(event) => void upload(event.target.files?.[0])} /></label>
    </>}
    {message && <p className="form-message" aria-live="polite">{message}</p>}
  </section><footer className="public-footer">Оплата поступает напрямую бизнесу</footer></main>;
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
