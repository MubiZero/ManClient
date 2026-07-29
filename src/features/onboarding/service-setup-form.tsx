import { OnboardingSubmitButton } from "@/features/onboarding/onboarding-submit-button";

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
    <form action={action} className="onboarding-step-form">
      <header className="setup-form-heading">
        <p className="step-kicker">Шаг 1 из 3</p>
        <h2>{service ? "Проверьте первую услугу" : "Добавьте первую услугу"}</h2>
        <p>Клиент увидит её название, свободное время и стоимость при записи.</p>
      </header>
      {service ? <input type="hidden" name="serviceId" value={service.id} /> : null}
      <div className="onboarding-fields">
        <label className="field-label">Название услуги<input className="text-input" name="serviceName" required minLength={2} maxLength={120} defaultValue={service?.name} placeholder="Например, Мужская стрижка" /></label>
        <div className="onboarding-field-row">
          <label className="field-label">Длительность, минут<input className="text-input" name="durationMinutes" type="number" inputMode="numeric" min={15} max={720} step={5} defaultValue={service?.durationMinutes ?? 45} required /></label>
          <label className="field-label">Стоимость, сомони<input className="text-input" name="amountSomoni" inputMode="decimal" pattern="\d+(?:[.,]\d{1,2})?" defaultValue={service ? (service.amountDiram / 100).toFixed(2) : undefined} placeholder="50.00" required /></label>
        </div>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <OnboardingSubmitButton label={service ? "Сохранить и перейти к оплате" : "Сохранить услугу"} pendingLabel="Сохраняем услугу" />
    </form>
  );
}
