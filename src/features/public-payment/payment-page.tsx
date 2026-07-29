"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type PaymentView = {
  amountDiram: number;
  status: string;
  reviewDeadline: Date | string | null;
  booking: { status: string; expiresAt: Date | string | null; startsAt: Date | string; customer: { name: string }; service: { name: string }; branch: { name: string } };
  submissions: Array<{ status: string; createdAt: Date | string }>;
};

export function PaymentPage({ token, initialPayment, paymentUrl }: { token: string; initialPayment: PaymentView; paymentUrl: string }) {
  const [payment, setPayment] = useState(initialPayment);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const complete = payment.status === "RECEIPT_ACCEPTED" || payment.booking.status === "CONFIRMED";
  const reviewing = ["RECEIPT_PROCESSING", "NEEDS_ATTENTION"].includes(payment.status);
  const rejected = payment.status === "REJECTED";

  useEffect(() => {
    if (!reviewing) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/public/payments/${token}`, { cache: "no-store" });
      if (response.ok) setPayment(await response.json() as PaymentView);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [reviewing, token]);

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
    <p className="context-label">{payment.booking.branch.name}</p><h1>{complete ? "Запись подтверждена" : reviewing ? "Чек проверяется" : rejected ? "Чек отклонён" : "Завершите оплату"}</h1>
    <div className="payment-summary"><strong>{payment.booking.service.name}</strong><span>{payment.booking.customer.name}</span><span>{(payment.amountDiram / 100).toFixed(2)} TJS</span></div>
    {complete ? <div className="success-panel" role="status"><strong>Всё готово</strong><p>Оплата принята. Бизнес видит подтверждённую запись.</p></div> : reviewing ? <div className="review-panel" role="status"><strong>Чек уже у бизнеса</strong><p>Можно закрыть страницу. Статус обновится автоматически, а запись удерживается на время проверки.</p></div> : <>
      {rejected ? <div className="review-panel" role="alert"><strong>Нужен другой чек</strong><p>Бизнес не смог подтвердить предыдущий чек. Проверьте оплату и прикрепите корректное изображение.</p></div> : null}
      <ol className="payment-steps"><li>Нажмите «Оплатить» и завершите перевод.</li><li>Вернитесь на эту страницу.</li><li>Прикрепите изображение чека.</li></ol>
      <a className="primary-link" href={paymentUrl} target="_blank" rel="noreferrer">Оплатить { (payment.amountDiram / 100).toFixed(2) } TJS</a>
      <label className="receipt-upload"><span>{uploading ? "Проверяем изображение…" : "Прикрепить чек"}</span><small>JPG, PNG или WebP, до 10 МБ</small><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={uploading} onChange={(event) => void upload(event.target.files?.[0])} /></label>
    </>}
    {message && <p className="form-message" aria-live="polite">{message}</p>}
  </section><footer className="public-footer">Оплата поступает напрямую бизнесу</footer></main>;
}
