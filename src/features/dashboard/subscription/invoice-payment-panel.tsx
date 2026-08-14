"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { formatSomoni } from "@/core/formatting/money";
import { PERIOD_LABELS, PLAN_LABELS } from "@/core/platform/plan-labels";
import type { BillingPeriod, SubscriptionInvoiceStatus, SubscriptionPlan } from "@/generated/prisma/client";
import { Button, ButtonLink } from "@/features/ui-kit/button";
import { Field } from "@/features/ui-kit/field";

export type OpenInvoice = {
  reference: string;
  amountDiram: number;
  plan: SubscriptionPlan;
  period: BillingPeriod;
  status: SubscriptionInvoiceStatus;
};

/**
 * The bill and the two ways to answer it: pay through the link, then send the receipt. The upload
 * stays available even without a link — the transfer can be made from any banking app, and the
 * receipt is what actually settles the invoice.
 */
export function InvoicePaymentPanel({ invoice, paymentUrl }: { invoice: OpenInvoice; paymentUrl: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setMessage("");
    const body = new FormData();
    body.set("receipt", file);
    try {
      const response = await fetch("/api/dashboard/subscription/receipt", { method: "POST", body });
      const result = await response.json() as { status?: string; error?: string };
      if (!response.ok) throw new Error(result.error);
      if (result.status === "ACCEPTED") {
        setMessage("Оплата подтверждена, подписка продлена.");
        // The receipt settled the invoice, so the page around this panel is already out of date.
        router.refresh();
      } else {
        setMessage("Чек принят и передан оператору — обычно это занимает несколько часов.");
      }
    } catch (error) {
      setMessage(uploadError(error));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-2xl font-semibold tabular-nums text-foreground">{formatSomoni(invoice.amountDiram)}</span>
        <span className="text-sm text-muted-foreground">
          {PLAN_LABELS[invoice.plan]} · {PERIOD_LABELS[invoice.period].toLowerCase()} · счёт <span className="font-mono">{invoice.reference}</span>
        </span>
      </div>

      {invoice.status === "NEEDS_ATTENTION" ? (
        <p className="text-sm text-muted-foreground">Присланный чек проверяет оператор. Пока проверка идёт, ничего делать не нужно.</p>
      ) : null}

      {paymentUrl ? (
        <ButtonLink href={paymentUrl} target="_blank" rel="noreferrer" className="w-fit">
          Оплатить переводом
        </ButtonLink>
      ) : (
        <p className="text-sm text-muted-foreground">
          Ссылку на оплату мы сейчас не выдаём — оплату принимает оператор ManClient. Напишите в поддержку, сделайте перевод и пришлите
          чек здесь же.
        </p>
      )}

      <Field label="Чек об оплате" hint="Скриншот перевода: JPEG, PNG или WebP, до 10 МБ.">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading}
          onChange={(event) => void upload(event.target.files?.[0])}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground"
        />
      </Field>

      {uploading ? <p className="text-sm text-muted-foreground">Отправляем чек…</p> : null}
      {message ? <p className="text-sm text-foreground">{message}</p> : null}
      <Button type="button" variant="quiet" className="self-start" onClick={() => inputRef.current?.click()} disabled={uploading}>
        Выбрать файл
      </Button>
    </div>
  );
}

function uploadError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  return ({
    INVALID_INPUT: "Не удалось прочитать файл. Пришлите скриншот в JPEG, PNG или WebP, до 10 МБ.",
    DUPLICATE_OPERATION: "Этот перевод уже был зачтён. Пришлите чек другого перевода.",
    NOT_FOUND: "Открытого счёта нет — оплачивать нечего.",
  } as Record<string, string>)[code] ?? "Не удалось отправить чек. Попробуйте ещё раз.";
}
