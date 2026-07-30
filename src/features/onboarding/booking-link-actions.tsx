"use client";

import Link from "next/link";
import { useState } from "react";

export function BookingLinkActions({ bookingPath }: { bookingPath: string }) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  async function copyBookingLink() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard is unavailable");
      await navigator.clipboard.writeText(new URL(bookingPath, window.location.origin).toString());
      setCopyStatus("Ссылка скопирована");
    } catch {
      setCopyStatus("Не удалось скопировать. Выделите ссылку вручную.");
    }
  }

  return (
    <section className="onboarding-booking-link" aria-labelledby="booking-link-title">
      <div>
        <p className="context-label" id="booking-link-title">Ссылка для клиентов</p>
        <p>Отправьте её клиентам или разместите в Instagram, Telegram и на сайте.</p>
      </div>
      <strong className="onboarding-booking-path">{bookingPath}</strong>
      <div className="onboarding-launch-actions">
        <Link className="primary-link" href={bookingPath}>Открыть страницу</Link>
        <button className="secondary-action" type="button" onClick={copyBookingLink}>Скопировать ссылку</button>
      </div>
      <p className="onboarding-copy-status" aria-live="polite">{copyStatus}</p>
    </section>
  );
}
