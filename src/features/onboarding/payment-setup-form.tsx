import { OnboardingSubmitButton } from "@/features/onboarding/onboarding-submit-button";
import { ButtonLink } from "@/features/ui-kit/button";
import { Card } from "@/features/ui-kit/card";
import { Field, Input } from "@/features/ui-kit/field";

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
    <Card>
      <div className="flex flex-col gap-6 p-6">
        <header className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Шаг 2 из 3</p>
          <h2 className="text-xl font-semibold text-foreground">Как принимаете оплату</h2>
          <p className="text-sm text-muted-foreground">
            Если берёте предоплату или депозит, клиент переведёт деньги на карту DushanbeCity и пришлёт
            чек. Если платят на месте — карта не нужна.
          </p>
        </header>
        <form action={action} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1 rounded-md bg-accent px-4 py-3 text-accent-foreground">
            <strong className="text-sm font-semibold">Реквизиты защищены</strong>
            <span className="text-[13px] leading-relaxed">
              Номер карты хранится в зашифрованном виде. В кабинете будут видны только последние четыре цифры.
            </span>
          </div>
          <Field label="Карта DushanbeCity">
            <Input
              className="tabular-nums tracking-wide"
              name="recipientCard"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9 ]{16,23}"
              placeholder="9762 0000 0000 0000"
              required
            />
          </Field>
          {error ? (
            <p className="rounded-md bg-danger-50 px-4 py-3 text-sm text-destructive dark:bg-danger-600/10" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ButtonLink variant="quiet" size="lg" href="/dashboard/onboarding?step=service">
              Назад к услуге
            </ButtonLink>
            <OnboardingSubmitButton label="Сохранить карту" pendingLabel="Сохраняем карту" className="w-full sm:w-auto sm:min-w-56" />
          </div>
        </form>
        <form action={skipAction} className="flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <strong className="text-sm font-semibold text-foreground">Оплата на месте</strong>
            <span className="text-[13px] leading-relaxed text-muted-foreground">
              Клиент платит в салоне, предоплату не берём. Карту можно добавить позже в настройках филиала.
            </span>
          </div>
          <OnboardingSubmitButton
            label="Пропустить этот шаг"
            pendingLabel="Сохраняем"
            variant="secondary"
            className="w-full shrink-0 sm:w-auto"
          />
        </form>
      </div>
    </Card>
  );
}
