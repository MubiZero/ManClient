import { ButtonLink } from "@/features/ui-kit/button";
import { Checkbox } from "@/features/ui-kit/checkbox";
import { Field, Input, Select } from "@/features/ui-kit/field";
import { SubmitButton } from "@/features/ui-kit/submit-button";

type BranchOption = { id: string; name: string };
type ServiceOption = { id: string; name: string; branchId: string };
type StaffValue = { id: string; displayName: string; phone: string | null; branchIds: string[]; primaryBranchId: string; serviceIds: string[]; commissionPercent?: number | null };

export function StaffForm({ action, branches, services, staff, error, fieldErrors, commissionEnabled }: { action: (formData: FormData) => void | Promise<void>; branches: BranchOption[]; services: ServiceOption[]; staff?: StaffValue; error?: string; fieldErrors?: Record<string, string>; commissionEnabled?: boolean }) {
  const editing = Boolean(staff);
  return (
    <form className="flex flex-col gap-6" action={action}>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{editing ? "Редактирование" : "Новый специалист"}</p>
        <h2 className="text-xl font-semibold text-foreground">{staff?.displayName ?? "Создать специалиста"}</h2>
        <p className="text-sm text-muted-foreground">Карточка специалиста отвечает за запись клиентов. Доступ в кабинет создаётся отдельно.</p>
      </div>
      {staff ? <input type="hidden" name="staffId" value={staff.id} /> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Имя специалиста" error={fieldErrors?.displayName}><Input name="displayName" required minLength={2} maxLength={120} defaultValue={staff?.displayName} /></Field>
        <Field label="Телефон" error={fieldErrors?.phone}><Input name="phone" type="tel" inputMode="tel" placeholder="+992 90 000 00 00" defaultValue={staff?.phone ?? ""} /></Field>
        {commissionEnabled ? (
          <Field label="Комиссия за услугу, %" error={fieldErrors?.commissionPercent}>
            <Input name="commissionPercent" type="number" inputMode="numeric" min={0} max={100} step={1} defaultValue={staff?.commissionPercent ?? ""} />
          </Field>
        ) : null}
      </div>
      <fieldset className="flex min-w-0 flex-col gap-1 rounded-md border border-border p-4">
        <legend className="px-1.5 text-sm font-semibold text-foreground">Филиалы</legend>
        {branches.map((item) => (
          <label key={item.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700 dark:has-[:checked]:bg-brand-950/40">
            <Checkbox name="branchIds" value={item.id} defaultChecked={staff ? staff.branchIds.includes(item.id) : item.id === branches[0]?.id} />
            <span>{item.name}</span>
          </label>
        ))}
      </fieldset>
      <Field label="Основной филиал" error={fieldErrors?.primaryBranchId}>
        <Select name="primaryBranchId" defaultValue={staff?.primaryBranchId ?? branches[0]?.id}>
          {branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </Field>
      <fieldset className="flex min-w-0 flex-col gap-1 rounded-md border border-border p-4">
        <legend className="px-1.5 text-sm font-semibold text-foreground">Услуги</legend>
        {services.length ? services.map((item) => (
          <label key={item.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700 dark:has-[:checked]:bg-brand-950/40">
            <Checkbox name="serviceIds" value={item.id} defaultChecked={staff?.serviceIds.includes(item.id)} />
            <span>{item.name}</span>
          </label>
        )) : <p className="text-sm text-muted-foreground">Услуги можно назначить позже.</p>}
      </fieldset>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="flex justify-end gap-3">
        <ButtonLink variant="quiet" href="/dashboard/settings/staff">Вернуться к команде</ButtonLink>
        <SubmitButton idle={editing ? "Сохранить специалиста" : "Создать специалиста"} pending={editing ? "Сохраняем специалиста" : "Создаём специалиста"} />
      </div>
    </form>
  );
}
