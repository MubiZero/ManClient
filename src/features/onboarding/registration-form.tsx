"use client";

import Link from "next/link";
import { useState } from "react";

import { formatTajikPhoneInput } from "@/features/onboarding/tajik-phone";

export function RegistrationForm({
  action,
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  error?: string;
}) {
  const [phone, setPhone] = useState("+992 ");
  return (
    <form action={action} className="login-form registration-form">
      <div className="registration-fields">
        <label className="field-label">Ваше имя<input className="text-input" name="ownerName" autoComplete="name" required minLength={2} maxLength={80} /></label>
        <label className="field-label">Номер телефона<input className="text-input" name="phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={17} pattern="\+992 \d{2} \d{3} \d{2} \d{2}" value={phone} placeholder="+992 __ ___ __ __" onChange={event => setPhone(formatTajikPhoneInput(event.target.value))} /></label>
        <label className="field-label">Пароль<input className="text-input" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} /><small>Минимум 8 символов</small></label>
        <label className="field-label">Название бизнеса<input className="text-input" name="businessName" autoComplete="organization" required minLength={2} maxLength={120} /></label>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="primary-button" type="submit">Создать бизнес</button>
      <p className="auth-switch">Уже есть кабинет? <Link href="/login">Войти</Link></p>
    </form>
  );
}
