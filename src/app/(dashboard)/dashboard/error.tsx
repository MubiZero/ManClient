"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { Button, ButtonLink } from "@/features/ui-kit/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Dashboard route failed", { digest: error.digest });
  }, [error.digest]);

  return (
    <section role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <AlertTriangle className="size-8 text-destructive" aria-hidden />
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Не удалось открыть раздел</p>
      <h1 className="text-xl font-semibold text-foreground">Данные временно недоступны</h1>
      <p className="max-w-sm text-sm text-muted-foreground">Настройки не изменились. Проверьте соединение и повторите загрузку.</p>
      <div className="flex items-center gap-2">
        <Button onClick={reset}>Повторить загрузку</Button>
        <ButtonLink variant="secondary" href="/dashboard">
          Вернуться в обзор
        </ButtonLink>
      </div>
    </section>
  );
}
