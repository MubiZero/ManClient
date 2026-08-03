import { Input, Select } from "@/features/ui-kit/field";

type StaffOption = { id: string; displayName: string };

export function CommissionFilters({
  staffId,
  from,
  to,
  staff,
}: {
  staffId?: string;
  from?: string;
  to?: string;
  staff: StaffOption[];
}) {
  return (
    <form className="flex flex-wrap items-end gap-3" method="get">
      <label htmlFor="commission-staff" className="sr-only">
        Специалист
      </label>
      <Select id="commission-staff" name="staffId" defaultValue={staffId ?? ""} className="w-auto">
        <option value="">Все специалисты</option>
        {staff.map((item) => (
          <option key={item.id} value={item.id}>
            {item.displayName}
          </option>
        ))}
      </Select>
      <label htmlFor="commission-from" className="sr-only">
        С даты
      </label>
      <Input id="commission-from" type="date" name="from" defaultValue={from ?? ""} className="w-auto" />
      <label htmlFor="commission-to" className="sr-only">
        По дату
      </label>
      <Input id="commission-to" type="date" name="to" defaultValue={to ?? ""} className="w-auto" />
      <button type="submit" className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">
        Показать
      </button>
    </form>
  );
}
