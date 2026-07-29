import Link from "next/link";

import { Field } from "@/features/ui/field";
import { SubmitButton } from "@/features/ui/submit-button";

type BranchOption = { id: string; name: string };
type ServiceOption = { id: string; name: string; branchId: string };
type StaffValue = { id: string; displayName: string; phone: string | null; branchIds: string[]; primaryBranchId: string; serviceIds: string[] };

export function StaffForm({ action, branches, services, staff, error }: { action: (formData: FormData) => void | Promise<void>; branches: BranchOption[]; services: ServiceOption[]; staff?: StaffValue; error?: string }) {
  const editing = Boolean(staff);
  return <form className="entity-form" action={action}>
    <div className="entity-form-heading"><p className="step-kicker">{editing ? "Редактирование" : "Новый специалист"}</p><h2>{staff?.displayName ?? "Создать специалиста"}</h2><p>Карточка специалиста отвечает за запись клиентов. Доступ в кабинет создаётся отдельно.</p></div>
    {staff ? <input type="hidden" name="staffId" value={staff.id} /> : null}
    <div className="entity-form-grid"><Field label="Имя специалиста" name="displayName" required minLength={2} maxLength={120} defaultValue={staff?.displayName} /><Field label="Телефон" name="phone" type="tel" inputMode="tel" placeholder="+992 90 000 00 00" defaultValue={staff?.phone ?? ""} /></div>
    <fieldset className="entity-options"><legend>Филиалы</legend>{branches.map(item => <label key={item.id}><input type="checkbox" name="branchIds" value={item.id} defaultChecked={staff ? staff.branchIds.includes(item.id) : item.id === branches[0]?.id} /><span>{item.name}</span></label>)}</fieldset>
    <label className="ui-field"><span className="ui-field-label">Основной филиал</span><select className="ui-input" name="primaryBranchId" defaultValue={staff?.primaryBranchId ?? branches[0]?.id}>{branches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <fieldset className="entity-options"><legend>Услуги</legend>{services.length ? services.map(item => <label key={item.id}><input type="checkbox" name="serviceIds" value={item.id} defaultChecked={staff?.serviceIds.includes(item.id)} /><span>{item.name}</span></label>) : <p>Услуги можно назначить позже.</p>}</fieldset>
    {error ? <p className="entity-error" role="alert">{error}</p> : null}
    <div className="entity-form-actions"><Link className="ui-button ui-button-quiet" href="/dashboard/settings/staff">Вернуться к команде</Link><SubmitButton idle={editing ? "Сохранить специалиста" : "Создать специалиста"} pending={editing ? "Сохраняем специалиста" : "Создаём специалиста"} /></div>
  </form>;
}
