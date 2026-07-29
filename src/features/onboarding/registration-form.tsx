import Link from "next/link";

export function RegistrationForm({
  action,
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  error?: string;
}) {
  return (
    <form action={action} className="login-form registration-form">
      <div className="registration-fields">
        <label className="field-label">Имя владельца<input className="text-input" name="ownerName" autoComplete="name" required minLength={2} maxLength={80} /></label>
        <label className="field-label">Электронная почта<input className="text-input" name="email" type="email" autoComplete="email" required maxLength={160} /></label>
        <label className="field-label">Пароль<input className="text-input" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /><small>Минимум 12 символов</small></label>
        <label className="field-label">Название бизнеса<input className="text-input" name="businessName" autoComplete="organization" required minLength={2} maxLength={120} /></label>
        <label className="field-label registration-wide-field">Основной филиал<input className="text-input" name="branchName" required minLength={2} maxLength={120} placeholder="Например, Душанбе, центр" /></label>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="primary-button" type="submit">Создать бизнес</button>
      <p className="auth-switch">Уже есть кабинет? <Link href="/login">Войти</Link></p>
    </form>
  );
}
