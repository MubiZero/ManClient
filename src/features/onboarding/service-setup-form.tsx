import { OnboardingSubmitButton } from "@/features/onboarding/onboarding-submit-button";
import { Card } from "@/features/ui-kit/card";
import { Field, Input } from "@/features/ui-kit/field";

type ExistingService = {
  id: string;
  name: string;
  durationMinutes: number;
  amountDiram: number;
};

export function ServiceSetupForm({
  action,
  error,
  service,
}: {
  action: (formData: FormData) => Promise<void>;
  error?: string;
  service?: ExistingService;
}) {
  return (
    <Card>
      <form action={action} className="flex flex-col gap-6 p-6">
        <header className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Шаг 1 из 3</p>
          <h2 className="text-xl font-semibold text-foreground">
            {service ? "Проверьте первую услугу" : "Добавьте первую услугу"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Клиент увидит её название, свободное время и стоимость при записи.
          </p>
        </header>
        {service ? <input type="hidden" name="serviceId" value={service.id} /> : null}
        <div className="flex flex-col gap-4">
          <Field label="Название услуги">
            <Input name="serviceName" required minLength={2} maxLength={120} defaultValue={service?.name} placeholder="Например, Мужская стрижка" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Длительность, минут">
              <Input name="durationMinutes" type="number" inputMode="numeric" min={15} max={720} step={5} defaultValue={service?.durationMinutes ?? 45} required />
            </Field>
            <Field label="Стоимость, сомони">
              <Input name="amountSomoni" inputMode="decimal" pattern="\d+(?:[.,]\d{1,2})?" defaultValue={service ? (service.amountDiram / 100).toFixed(2) : undefined} placeholder="50.00" required />
            </Field>
          </div>
        </div>
        {error ? (
          <p className="rounded-md bg-danger-50 px-4 py-3 text-sm text-destructive dark:bg-danger-600/10" role="alert">
            {error}
          </p>
        ) : null}
        <OnboardingSubmitButton
          label={service ? "Сохранить и перейти к оплате" : "Сохранить услугу"}
          pendingLabel="Сохраняем услугу"
        />
      </form>
    </Card>
  );
}
