import Link from "next/link";

import { OnboardingSubmitButton } from "@/features/onboarding/onboarding-submit-button";

/**
 * The step asks a question rather than demanding a card: prepayment starts switched off, so for most
 * salons the honest answer here is "we take payment on the premises" and the card is somebody else's
 * problem. Both answers are a decision the owner makes, and either one moves the wizard forward.
 */
export function PaymentSetupForm({
  action,
  skipAction,
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  skipAction: () => Promise<void>;
  error?: string;
}) {
  return (
    <div className="onboarding-step-form">
      <header className="setup-form-heading">
        <p className="step-kicker">Шаг 2 из 3</p>
        <h2>Как принимаете оплату</h2>
        <p>Если берёте предоплату или депозит, клиент переведёт деньги на карту DushanbeCity и пришлёт чек. Если платят на месте — карта не нужна.</p>
      </header>
      <form action={action} className="onboarding-payment-choice">
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
      <form action={skipAction} className="onboarding-payment-skip">
        <div>
          <strong>Оплата на месте</strong>
          <span>Клиент платит в салоне, предоплату не берём. Карту можно добавить позже в настройках филиала.</span>
        </div>
        <OnboardingSubmitButton label="Пропустить этот шаг" pendingLabel="Сохраняем" variant="quiet" />
      </form>
    </div>
  );
}
