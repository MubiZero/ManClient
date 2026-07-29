"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/features/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Dashboard route failed", { digest: error.digest });
  }, [error.digest]);

  return <section className="dashboard-content route-error" role="alert">
    <div className="ui-empty-mark" aria-hidden>!</div>
    <p className="context-label">Не удалось открыть раздел</p>
    <h1>Данные временно недоступны</h1>
    <p>Настройки не изменились. Проверьте соединение и повторите загрузку.</p>
    <div className="route-error-actions"><Button onClick={reset}>Повторить загрузку</Button><Link className="ui-button ui-button-secondary" href="/dashboard">Вернуться в обзор</Link></div>
  </section>;
}
