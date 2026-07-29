import Link from "next/link";

import { formatTajikPhoneInput } from "@/core/formatting/tajik-phone";
import { Field } from "@/features/ui/field";
import { SubmitButton } from "@/features/ui/submit-button";

type BranchValue = { id: string; name: string; address: string | null; phone: string | null; timeZone: string };

export function BranchForm({ action, branch, error }: { action: (formData: FormData) => void | Promise<void>; branch?: BranchValue; error?: string }) {
  const editing = Boolean(branch);
  return (
    <form className="entity-form" action={action}>
      <div className="entity-form-heading"><p className="step-kicker">{editing ? "Редактирование" : "Новый филиал"}</p><h2>{editing ? branch?.name : "Создать филиал"}</h2><p>Укажите данные, которые помогают клиенту понять, куда он записывается.</p></div>
      {branch ? <input type="hidden" name="branchId" value={branch.id} /> : null}
      <div className="entity-form-grid">
        <Field label="Название филиала" name="name" required minLength={2} maxLength={120} defaultValue={branch?.name} />
        <Field label="Контактный телефон" name="phone" type="tel" inputMode="tel" placeholder="+992 90 000 00 00" defaultValue={branch?.phone ? formatTajikPhoneInput(branch.phone) : ""} />
        <Field label="Адрес" name="address" maxLength={240} defaultValue={branch?.address ?? ""} className="entity-form-wide" />
        <label className="ui-field"><span className="ui-field-label">Часовой пояс</span><select className="ui-input" name="timeZone" defaultValue={branch?.timeZone ?? "Asia/Dushanbe"}><option value="Asia/Dushanbe">Душанбе (UTC+5)</option></select></label>
      </div>
      {error ? <p className="entity-error" role="alert">{error}</p> : null}
      <div className="entity-form-actions"><Link className="ui-button ui-button-quiet" href="/dashboard/settings/branches">Вернуться к филиалам</Link><SubmitButton idle={editing ? "Сохранить филиал" : "Создать филиал"} pending={editing ? "Сохраняем филиал" : "Создаём филиал"} /></div>
    </form>
  );
}
