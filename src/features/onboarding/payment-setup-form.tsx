import Link from "next/link";

import { OnboardingSubmitButton } from "@/features/onboarding/onboarding-submit-button";

export function PaymentSetupForm({
  action,
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  error?: string;
}) {
  return (
    <form action={action} className="onboarding-step-form">
      <header className="setup-form-heading">
        <p className="step-kicker">Шаг 2 из 3</p>
        <h2>Куда принимать оплату</h2>
        <p>Клиент оплатит запись через ExpressPay. Деньги поступят напрямую вашему бизнесу.</p>
      </header>
      <div className="payment-security-note">
        <strong>Реквизиты защищены</strong>
        <span>Номер карты хранится в зашифрованном виде. В кабинете будут видны только последние четыре цифры.</span>
      </div>
      <label className="field-label">Карта DushanbeCity<input className="text-input payment-card-input" name="recipientCard" inputMode="numeric" autoComplete="off" pattern="[0-9 ]{16,23}" placeholder="9762 0000 0000 0000" required /></label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="onboarding-form-actions">
        <Link className="quiet-action onboarding-back-link" href="/dashboard/onboarding?step=service">Назад к услуге</Link>
        <OnboardingSubmitButton label="Сохранить карту" pendingLabel="Сохраняем карту" />
      </div>
    </form>
  );
}
