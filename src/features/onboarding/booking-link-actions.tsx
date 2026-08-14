"use client";

import { useState } from "react";

import { Button, ButtonLink } from "@/features/ui-kit/button";

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
    <section className="flex flex-col gap-4 rounded-md bg-secondary p-4" aria-labelledby="booking-link-title">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground" id="booking-link-title">Ссылка для клиентов</p>
        <p className="text-sm text-muted-foreground">Отправьте её клиентам или разместите в Instagram, Telegram и на сайте.</p>
      </div>
      <strong className="select-all break-words rounded-md border border-border bg-card px-3 py-3 text-sm font-semibold text-foreground">
        {bookingPath}
      </strong>
      <div className="flex flex-col gap-2 sm:flex-row">
        <ButtonLink className="w-full sm:w-auto" href={bookingPath}>Открыть страницу</ButtonLink>
        <Button className="w-full sm:w-auto" variant="secondary" type="button" onClick={copyBookingLink}>
          Скопировать ссылку
        </Button>
      </div>
      <p className="min-h-5 text-[13px] text-muted-foreground" aria-live="polite">{copyStatus}</p>
    </section>
  );
}
