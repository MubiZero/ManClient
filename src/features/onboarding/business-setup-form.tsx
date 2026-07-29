export function BusinessSetupForm({
  action,
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  error?: string;
}) {
  return (
    <form action={action} className="onboarding-setup-form">
      <div className="setup-form-heading"><h2>Первая услуга и оплата</h2><p>После этого клиенты смогут выбрать время и оплатить запись напрямую вашему бизнесу.</p></div>
      <div className="registration-fields">
        <label className="field-label registration-wide-field">Первая услуга<input className="text-input" name="serviceName" required minLength={2} maxLength={120} placeholder="Например, Мужская стрижка" /></label>
        <label className="field-label">Длительность, минут<input className="text-input" name="durationMinutes" type="number" inputMode="numeric" min={15} max={720} step={5} defaultValue={45} required /></label>
        <label className="field-label">Стоимость, сомони<input className="text-input" name="amountSomoni" inputMode="decimal" pattern="\d+(?:[.,]\d{1,2})?" placeholder="50.00" required /></label>
        <label className="field-label registration-wide-field">Карта DushanbeCity<input className="text-input" name="recipientCard" inputMode="numeric" autoComplete="off" pattern="[0-9 ]{16,23}" placeholder="9762 0001 2835 1953" required /><small>Номер шифруется. В кабинете будут видны только последние четыре цифры.</small></label>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="primary-button" type="submit">Сохранить и продолжить</button>
    </form>
  );
}
