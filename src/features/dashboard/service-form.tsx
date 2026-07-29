import Link from "next/link";

import { Field } from "@/features/ui/field";
import { SubmitButton } from "@/features/ui/submit-button";

type Option = { id: string; name: string };
type StaffOption = { id: string; displayName: string; branchNames: string[] };
type ResourceOption = { id: string; name: string; branchId: string };
type ServiceValue = { id: string; branchId: string; name: string; description: string | null; durationMinutes: number; amountDiram: number; isPublished: boolean; staffIds: string[]; resourceIds: string[] };

export function ServiceForm({ action, branches, staff, resources, service, error }: { action: (formData: FormData) => void | Promise<void>; branches: Option[]; staff: StaffOption[]; resources: ResourceOption[]; service?: ServiceValue; error?: string }) {
  const editing = Boolean(service);
  return <form className="entity-form" action={action}>
    <div className="entity-form-heading"><p className="step-kicker">{editing ? "Редактирование" : "Новая услуга"}</p><h2>{service?.name ?? "Создать услугу"}</h2><p>Опишите услугу, назначьте исполнителей и при необходимости зарезервируйте ресурс.</p></div>
    {service ? <input type="hidden" name="serviceId" value={service.id} /> : null}
    <div className="entity-form-grid">
      <Field label="Название услуги" name="name" required minLength={2} maxLength={120} defaultValue={service?.name} />
      <label className="ui-field"><span className="ui-field-label">Филиал</span><select className="ui-input" name="branchId" defaultValue={service?.branchId ?? branches[0]?.id} required>{branches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <Field label="Длительность, минут" name="durationMinutes" type="number" min={5} max={720} step={5} required defaultValue={service?.durationMinutes ?? 45} />
      <Field label="Стоимость, сомони" name="amountSomoni" inputMode="decimal" required defaultValue={service ? (service.amountDiram / 100).toFixed(2) : ""} placeholder="50,00" />
      <label className="ui-field entity-form-wide"><span className="ui-field-label">Описание</span><textarea className="ui-input ui-textarea" name="description" maxLength={1000} defaultValue={service?.description ?? ""} /></label>
    </div>
    <div className="entity-assignment-grid">
      <fieldset className="entity-options"><legend>Специалисты</legend>{staff.length ? staff.map(item => <label key={item.id}><input type="checkbox" name="staffIds" value={item.id} defaultChecked={service?.staffIds.includes(item.id)} /><span><strong>{item.displayName}</strong><small>{item.branchNames.join(", ")}</small></span></label>) : <p>Сначала добавьте специалиста.</p>}</fieldset>
      <fieldset className="entity-options"><legend>Ресурсы</legend>{resources.length ? resources.map(item => <label key={item.id}><input type="checkbox" name="resourceIds" value={item.id} defaultChecked={service?.resourceIds.includes(item.id)} /><span>{item.name}</span></label>) : <p>Для этой услуги ресурс не обязателен.</p>}</fieldset>
    </div>
    <label className="entity-toggle"><input type="checkbox" name="isPublished" value="true" defaultChecked={service?.isPublished} /><span><strong>Опубликовать для клиентов</strong><small>Публикация доступна, когда назначен специалист и есть рабочий график.</small></span></label>
    {error ? <p className="entity-error" role="alert">{error}</p> : null}
    <div className="entity-form-actions"><Link className="ui-button ui-button-quiet" href="/dashboard/settings/services">Вернуться к услугам</Link><SubmitButton idle={editing ? "Сохранить услугу" : "Создать услугу"} pending={editing ? "Сохраняем услугу" : "Создаём услугу"} /></div>
  </form>;
}
