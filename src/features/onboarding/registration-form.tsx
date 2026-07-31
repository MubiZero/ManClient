"use client";

import Link from "next/link";
import { useState } from "react";

import { formatTajikPhoneInput } from "@/features/onboarding/tajik-phone";
import { Button } from "@/features/ui-kit/button";
import { Field, Input } from "@/features/ui-kit/field";

export function RegistrationForm({
  action,
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  error?: string;
}) {
  const [phone, setPhone] = useState("+992 ");
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Ваше имя">
          <Input name="ownerName" autoComplete="name" required minLength={2} maxLength={80} />
        </Field>
        <Field label="Номер телефона">
          <Input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            maxLength={17}
            pattern="\+992 \d{2} \d{3} \d{2} \d{2}"
            value={phone}
            placeholder="+992 __ ___ __ __"
            onChange={(event) => setPhone(formatTajikPhoneInput(event.target.value))}
          />
        </Field>
        <Field label="Пароль" hint="Минимум 8 символов">
          <Input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
        </Field>
        <Field label="Название бизнеса">
          <Input name="businessName" autoComplete="organization" required minLength={2} maxLength={120} />
        </Field>
      </div>
      {error ? (
        <p className="text-[13px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg">
        Создать бизнес
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Уже есть кабинет? <Link className="font-medium text-primary hover:underline" href="/login">Войти</Link>
      </p>
    </form>
  );
}
