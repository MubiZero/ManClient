import { Checkbox } from "@/features/ui-kit/checkbox";
import { ButtonLink } from "@/features/ui-kit/button";
import { Field, Input, Select, Textarea } from "@/features/ui-kit/field";
import { SubmitButton } from "@/features/ui-kit/submit-button";

type Option = { id: string; name: string };
type StaffOption = { id: string; displayName: string; branchNames: string[] };
type ResourceOption = { id: string; name: string; branchId: string };
type ServiceValue = { id: string; branchId: string; name: string; description: string | null; durationMinutes: number; amountDiram: number; isPublished: boolean; staffIds: string[]; resourceIds: string[] };

export function ServiceForm({ action, branches, staff, resources, service, error }: { action: (formData: FormData) => void | Promise<void>; branches: Option[]; staff: StaffOption[]; resources: ResourceOption[]; service?: ServiceValue; error?: string }) {
  const editing = Boolean(service);
  return (
    <form className="flex flex-col gap-6" action={action}>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{editing ? "Редактирование" : "Новая услуга"}</p>
        <h2 className="text-xl font-semibold text-foreground">{service?.name ?? "Создать услугу"}</h2>
        <p className="text-sm text-muted-foreground">Опишите услугу, назначьте исполнителей и при необходимости зарезервируйте ресурс.</p>
      </div>
      {service ? <input type="hidden" name="serviceId" value={service.id} /> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Название услуги"><Input name="name" required minLength={2} maxLength={120} defaultValue={service?.name} /></Field>
        <Field label="Филиал">
          <Select name="branchId" defaultValue={service?.branchId ?? branches[0]?.id} required>
            {branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </Field>
        <Field label="Длительность, минут"><Input name="durationMinutes" type="number" min={5} max={720} step={5} required defaultValue={service?.durationMinutes ?? 45} /></Field>
        <Field label="Стоимость, сомони"><Input name="amountSomoni" inputMode="decimal" required defaultValue={service ? (service.amountDiram / 100).toFixed(2) : ""} placeholder="50,00" /></Field>
        <div className="sm:col-span-2">
          <Field label="Описание"><Textarea name="description" maxLength={1000} defaultValue={service?.description ?? ""} /></Field>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <fieldset className="flex min-w-0 flex-col gap-1 rounded-md border border-border p-4">
          <legend className="px-1.5 text-sm font-semibold text-foreground">Специалисты</legend>
          {staff.length ? staff.map((item) => (
            <label key={item.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700 dark:has-[:checked]:bg-brand-950/40">
              <Checkbox name="staffIds" value={item.id} defaultChecked={service?.staffIds.includes(item.id)} />
              <span className="flex flex-col gap-0.5">
                <strong className="font-medium">{item.displayName}</strong>
                <small className="text-xs text-muted-foreground">{item.branchNames.join(", ")}</small>
              </span>
            </label>
          )) : <p className="text-sm text-muted-foreground">Сначала добавьте специалиста.</p>}
        </fieldset>
        <fieldset className="flex min-w-0 flex-col gap-1 rounded-md border border-border p-4">
          <legend className="px-1.5 text-sm font-semibold text-foreground">Ресурсы</legend>
          {resources.length ? resources.map((item) => (
            <label key={item.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700 dark:has-[:checked]:bg-brand-950/40">
              <Checkbox name="resourceIds" value={item.id} defaultChecked={service?.resourceIds.includes(item.id)} />
              <span>{item.name}</span>
            </label>
          )) : <p className="text-sm text-muted-foreground">Для этой услуги ресурс не обязателен.</p>}
        </fieldset>
      </div>
      <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-md bg-secondary px-4 py-3.5">
        <Checkbox name="isPublished" value="true" defaultChecked={service?.isPublished} />
        <span className="flex flex-col gap-0.5">
          <strong className="font-medium text-foreground">Опубликовать для клиентов</strong>
          <small className="text-xs text-muted-foreground">Публикация доступна, когда назначен специалист и есть рабочий график.</small>
        </span>
      </label>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="flex justify-end gap-3">
        <ButtonLink variant="quiet" href="/dashboard/settings/services">Вернуться к услугам</ButtonLink>
        <SubmitButton idle={editing ? "Сохранить услугу" : "Создать услугу"} pending={editing ? "Сохраняем услугу" : "Создаём услугу"} />
      </div>
    </form>
  );
}
