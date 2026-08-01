"use client";

import { useState } from "react";

import { Button } from "@/features/ui-kit/button";
import { Card, CardContent } from "@/features/ui-kit/card";
import { Field, Input, Label, Select } from "@/features/ui-kit/field";

export type WhatsAppSettingsValue = {
  phoneNumberId: string | null;
  templateName: string | null;
  confirmationTemplateName: string | null;
  languageCode: string;
};

export function WhatsAppSettingsForm({ initial }: { initial: WhatsAppSettingsValue }) {
  const [phoneNumberId, setPhoneNumberId] = useState(initial.phoneNumberId ?? "");
  const [templateName, setTemplateName] = useState(initial.templateName ?? "");
  const [confirmationTemplateName, setConfirmationTemplateName] = useState(initial.confirmationTemplateName ?? "");
  const [languageCode, setLanguageCode] = useState(initial.languageCode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/dashboard/settings/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumberId, templateName, confirmationTemplateName, languageCode }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error);
      setNotice("Настройки WhatsApp сохранены");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 pt-6">
        <Field label="Phone Number ID" hint="Идентификатор номера в WhatsApp Cloud API (Meta Business)." htmlFor="whatsapp-phone-number-id">
          <Input id="whatsapp-phone-number-id" value={phoneNumberId} onChange={(event) => setPhoneNumberId(event.target.value)} placeholder="1234567890" />
        </Field>

        <Field label="Шаблон подтверждения записи" hint="Название одобренного WhatsApp-шаблона для подтверждения оплаты." htmlFor="whatsapp-confirmation-template">
          <Input
            id="whatsapp-confirmation-template"
            value={confirmationTemplateName}
            onChange={(event) => setConfirmationTemplateName(event.target.value)}
            placeholder="booking_confirmed"
          />
        </Field>

        <Field label="Шаблон напоминания" hint="Название одобренного WhatsApp-шаблона для напоминаний о визите." htmlFor="whatsapp-reminder-template">
          <Input id="whatsapp-reminder-template" value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="booking_reminder" />
        </Field>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="whatsapp-language">Язык шаблонов</Label>
          <Select id="whatsapp-language" value={languageCode} onChange={(event) => setLanguageCode(event.target.value)} className="max-w-40">
            <option value="ru">Русский</option>
            <option value="tg">Тоҷикӣ</option>
          </Select>
        </div>

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
    FORBIDDEN: "У вас нет доступа к настройке WhatsApp. Обратитесь к владельцу бизнеса.",
    NOT_FOUND: "Бизнес не найден.",
  } as Record<string, string>)[code] ?? "Не удалось сохранить. Попробуйте ещё раз.";
}
