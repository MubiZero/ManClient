"use client";

import { useState } from "react";

import { Button } from "@/features/ui-kit/button";
import { Card, CardContent } from "@/features/ui-kit/card";
import { Checkbox } from "@/features/ui-kit/checkbox";

export type NotificationSettingsValue = {
  notifyOnNewBooking: boolean;
  notifyOnPaymentNeedsReview: boolean;
  notifyOnCancellation: boolean;
  smsNotificationsEnabled: boolean;
  smsFeatureAvailable: boolean;
};

export function NotificationSettingsForm({ initial }: { initial: NotificationSettingsValue }) {
  const [notifyOnNewBooking, setNotifyOnNewBooking] = useState(initial.notifyOnNewBooking);
  const [notifyOnPaymentNeedsReview, setNotifyOnPaymentNeedsReview] = useState(initial.notifyOnPaymentNeedsReview);
  const [notifyOnCancellation, setNotifyOnCancellation] = useState(initial.notifyOnCancellation);
  const [smsNotificationsEnabled, setSmsNotificationsEnabled] = useState(initial.smsNotificationsEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/dashboard/settings/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notifyOnNewBooking,
          notifyOnPaymentNeedsReview,
          notifyOnCancellation,
          smsNotificationsEnabled,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error);
      setNotice("Настройки уведомлений сохранены");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 pt-6">
        <fieldset className="flex flex-col gap-2">
          <legend className="px-1.5 text-sm font-semibold text-foreground">Уведомления бизнеса</legend>
          <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-md bg-secondary px-4 py-3.5">
            <Checkbox checked={notifyOnNewBooking} onChange={(event) => setNotifyOnNewBooking(event.target.checked)} />
            <span className="flex flex-col gap-0.5">
              <strong className="font-medium text-foreground">Новая запись</strong>
              <small className="text-xs text-muted-foreground">Уведомлять, когда клиент оформил новую запись.</small>
            </span>
          </label>
          <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-md bg-secondary px-4 py-3.5">
            <Checkbox checked={notifyOnPaymentNeedsReview} onChange={(event) => setNotifyOnPaymentNeedsReview(event.target.checked)} />
            <span className="flex flex-col gap-0.5">
              <strong className="font-medium text-foreground">Оплата требует проверки</strong>
              <small className="text-xs text-muted-foreground">Уведомлять, когда чек об оплате нужно проверить вручную.</small>
            </span>
          </label>
          <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-md bg-secondary px-4 py-3.5">
            <Checkbox checked={notifyOnCancellation} onChange={(event) => setNotifyOnCancellation(event.target.checked)} />
            <span className="flex flex-col gap-0.5">
              <strong className="font-medium text-foreground">Отмена записи</strong>
              <small className="text-xs text-muted-foreground">Уведомлять, когда запись отменена.</small>
            </span>
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="px-1.5 text-sm font-semibold text-foreground">SMS-уведомления клиентам</legend>
          <label className={`flex min-h-16 items-center gap-3 rounded-md bg-secondary px-4 py-3.5 ${initial.smsFeatureAvailable ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
            <Checkbox
              checked={smsNotificationsEnabled}
              disabled={!initial.smsFeatureAvailable}
              onChange={(event) => setSmsNotificationsEnabled(event.target.checked)}
            />
            <span className="flex flex-col gap-0.5">
              <strong className="font-medium text-foreground">Отправлять SMS клиентам</strong>
              <small className="text-xs text-muted-foreground">
                {initial.smsFeatureAvailable
                  ? "Подтверждения, отмены и напоминания о записи будут дублироваться по SMS."
                  : "Доступно на тарифах Стандарт и Премиум. Обновите тариф, чтобы включить SMS-уведомления."}
              </small>
            </span>
          </label>
        </fieldset>


        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        {notice ? <p className="text-sm text-primary" role="status">{notice}</p> : null}

        <div className="flex justify-end">
          <Button type="button" onClick={save} loading={saving}>
            Сохранить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "INVALID_INPUT";
  return ({
    INVALID_INPUT: "Проверьте введённые значения.",
    FORBIDDEN: "У вас нет доступа к настройке уведомлений. Обратитесь к владельцу бизнеса.",
    NOT_FOUND: "Бизнес не найден.",
  } as Record<string, string>)[code] ?? "Не удалось сохранить. Попробуйте ещё раз.";
}
