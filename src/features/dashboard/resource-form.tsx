import Link from "next/link";

import { Field } from "@/features/ui/field";
import { SubmitButton } from "@/features/ui/submit-button";

type BranchOption = { id: string; name: string };
type ServiceOption = { id: string; name: string; branchId: string };
type ResourceValue = { id: string; branchId: string; name: string; kind: string; capacity: number; isAvailable: boolean; serviceIds: string[] };

export function ResourceForm({ action, branches, services, resource, error }: { action: (formData: FormData) => void | Promise<void>; branches: BranchOption[]; services: ServiceOption[]; resource?: ResourceValue; error?: string }) {
  const editing = Boolean(resource);
  return <form className="entity-form" action={action}>
    <div className="entity-form-heading"><p className="step-kicker">{editing ? "Редактирование" : "Новый ресурс"}</p><h2>{resource?.name ?? "Создать ресурс"}</h2><p>Ресурс бронируется вместе с услугой и не может быть занят двумя клиентами одновременно.</p></div>
    {resource ? <input type="hidden" name="resourceId" value={resource.id} /> : null}
    <div className="entity-form-grid">
      <Field label="Название ресурса" name="name" required minLength={2} maxLength={120} defaultValue={resource?.name} />
      <label className="ui-field"><span className="ui-field-label">Филиал</span><select className="ui-input" name="branchId" defaultValue={resource?.branchId ?? branches[0]?.id}>{branches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="ui-field"><span className="ui-field-label">Тип ресурса</span><select className="ui-input" name="kind" defaultValue={resource?.kind ?? "OTHER"}><option value="WORKSTATION">Рабочее место</option><option value="ROOM">Кабинет или комната</option><option value="LIFT">Подъёмник</option><option value="EQUIPMENT">Оборудование</option><option value="OTHER">Другое</option></select></label>
      <Field label="Вместимость" name="capacity" type="number" min={1} max={100} required defaultValue={resource?.capacity ?? 1} />
    </div>
    <fieldset className="entity-options"><legend>Услуги</legend>{services.length ? services.map(item => <label key={item.id}><input type="checkbox" name="serviceIds" value={item.id} defaultChecked={resource?.serviceIds.includes(item.id)} /><span>{item.name}</span></label>) : <p>Услуги можно связать позже.</p>}</fieldset>
    <label className="entity-toggle"><input type="checkbox" name="isAvailable" value="true" defaultChecked={resource?.isAvailable ?? true} /><span><strong>Доступен для записи</strong><small>Отключите временно, если ресурс на ремонте или недоступен.</small></span></label>
    {error ? <p className="entity-error" role="alert">{error}</p> : null}
    <div className="entity-form-actions"><Link className="ui-button ui-button-quiet" href="/dashboard/settings/resources">Вернуться к ресурсам</Link><SubmitButton idle={editing ? "Сохранить ресурс" : "Создать ресурс"} pending={editing ? "Сохраняем ресурс" : "Создаём ресурс"} /></div>
  </form>;
}
