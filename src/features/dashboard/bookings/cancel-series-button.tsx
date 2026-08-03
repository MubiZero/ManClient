"use client";

import type { FormEvent } from "react";

import { SubmitButton } from "@/features/ui-kit/submit-button";

export function CancelSeriesButton({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm("Отменить все будущие записи этой серии? Действие нельзя отменить.")) {
      event.preventDefault();
    }
  }

  return (
    <form action={action} onSubmit={onSubmit}>
      <SubmitButton idle="Отменить всю серию" pending="Отменяем серию…" variant="destructive" />
    </form>
  );
}
