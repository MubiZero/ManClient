import { formatTajikPhoneInput } from "@/core/formatting/tajik-phone";
import { ButtonLink } from "@/features/ui-kit/button";
import { Field, Input, Select } from "@/features/ui-kit/field";
import { SubmitButton } from "@/features/ui-kit/submit-button";

type BranchValue = { id: string; name: string; address: string | null; phone: string | null; timeZone: string };

export function BranchForm({ action, branch, error }: { action: (formData: FormData) => void | Promise<void>; branch?: BranchValue; error?: string }) {
  const editing = Boolean(branch);
  return (
    <form className="flex flex-col gap-6" action={action}>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{editing ? "Редактирование" : "Новый филиал"}</p>
        <h2 className="text-xl font-semibold text-foreground">{editing ? branch?.name : "Создать филиал"}</h2>
        <p className="text-sm text-muted-foreground">Укажите данные, которые помогают клиенту понять, куда он записывается.</p>
      </div>
      {branch ? <input type="hidden" name="branchId" value={branch.id} /> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Название филиала"><Input name="name" required minLength={2} maxLength={120} defaultValue={branch?.name} /></Field>
        <Field label="Контактный телефон"><Input name="phone" type="tel" inputMode="tel" placeholder="+992 90 000 00 00" defaultValue={branch?.phone ? formatTajikPhoneInput(branch.phone) : ""} /></Field>
        <div className="sm:col-span-2">
          <Field label="Адрес"><Input name="address" maxLength={240} defaultValue={branch?.address ?? ""} /></Field>
        </div>
        <Field label="Часовой пояс">
          <Select name="timeZone" defaultValue={branch?.timeZone ?? "Asia/Dushanbe"}>
            <option value="Asia/Dushanbe">Душанбе (UTC+5)</option>
          </Select>
        </Field>
      </div>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="flex justify-end gap-3">
        <ButtonLink variant="quiet" href="/dashboard/settings/branches">Вернуться к филиалам</ButtonLink>
        <SubmitButton idle={editing ? "Сохранить филиал" : "Создать филиал"} pending={editing ? "Сохраняем филиал" : "Создаём филиал"} />
      </div>
    </form>
  );
}
