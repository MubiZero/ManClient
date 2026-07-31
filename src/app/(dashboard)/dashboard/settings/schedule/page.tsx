import { redirect } from "next/navigation";

import { requireBusinessAdmin } from "@/core/auth/business-session";
import {
  removeScheduleException,
  replaceBranchSchedule,
  replaceStaffSchedule,
  upsertScheduleException,
} from "@/core/business-settings/schedule-service";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { localDateTimeToUtc, todayInTimeZone } from "@/core/formatting/dushanbe-date";
import { EntityListPage } from "@/features/dashboard/entity-list-page";
import { ScheduleEditor } from "@/features/dashboard/schedule-editor";
import { Button } from "@/features/ui-kit/button";
import { Card, CardContent } from "@/features/ui-kit/card";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { Field, Input, Select } from "@/features/ui-kit/field";
import { SubmitButton } from "@/features/ui-kit/submit-button";

type PageProps = { searchParams: Promise<{ branch?: string; staff?: string; notice?: string; error?: string }> };
type Interval = { dayOfWeek: number; startsAt: string; endsAt: string };

export default async function SchedulePage({ searchParams }: PageProps) {
  const member = await requireBusinessAdmin();
  const query = await searchParams;
  const branches = await prisma.branch.findMany({ where: { businessId: member.businessId, archivedAt: null }, select: { id: true, name: true, timeZone: true }, orderBy: { name: "asc" } });
  const branch = branches.find((item) => item.id === query.branch) ?? branches[0];

  if (!branch) return <EntityListPage title="Расписание" description="Сначала создайте работающий филиал."><p className="dashboard-empty">Без филиала невозможно настроить рабочее время.</p></EntityListPage>;

  const staff = await prisma.staffMember.findMany({
    where: { businessId: member.businessId, archivedAt: null, branches: { some: { branchId: branch.id } } },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });
  const selectedStaff = staff.find((item) => item.id === query.staff);
  const [branchRules, branchBreaks, staffRules, staffBreaks, exceptions] = await Promise.all([
    prisma.businessScheduleRule.findMany({ where: { branchId: branch.id }, orderBy: [{ dayOfWeek: "asc" }, { startsAt: "asc" }] }),
    prisma.scheduleBreak.findMany({ where: { branchId: branch.id, staffId: null }, orderBy: [{ dayOfWeek: "asc" }, { startsAt: "asc" }] }),
    selectedStaff ? prisma.staffScheduleRule.findMany({ where: { branchId: branch.id, staffId: selectedStaff.id }, orderBy: [{ dayOfWeek: "asc" }, { startsAt: "asc" }] }) : Promise.resolve([]),
    selectedStaff ? prisma.scheduleBreak.findMany({ where: { branchId: branch.id, staffId: selectedStaff.id }, orderBy: [{ dayOfWeek: "asc" }, { startsAt: "asc" }] }) : Promise.resolve([]),
    prisma.scheduleException.findMany({ where: { branchId: branch.id, ...(selectedStaff ? { staffId: selectedStaff.id } : { staffId: null }), endsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, take: 20 }),
  ]);
  const target = targetQuery(branch.id, selectedStaff?.id);

  async function saveSchedule(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    const branchId = String(formData.get("branchId") ?? "");
    const staffId = String(formData.get("staffId") ?? "");
    const schedule = scheduleValues(formData);
    try {
      if (staffId) await replaceStaffSchedule({ businessId: current.businessId, actorUserId: current.userId, branchId, staffId, ...schedule });
      else await replaceBranchSchedule({ businessId: current.businessId, actorUserId: current.userId, branchId, ...schedule });
    } catch (error) {
      redirect(`/dashboard/settings/schedule?${targetQuery(branchId, staffId || undefined)}&error=${errorCode(error)}`);
    }
    redirect(`/dashboard/settings/schedule?${targetQuery(branchId, staffId || undefined)}&notice=saved`);
  }

  async function restoreInheritance(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    const branchId = String(formData.get("branchId") ?? "");
    const staffId = String(formData.get("staffId") ?? "");
    await replaceStaffSchedule({ businessId: current.businessId, actorUserId: current.userId, branchId, staffId, rules: [], breaks: [] });
    redirect(`/dashboard/settings/schedule?${targetQuery(branchId, staffId)}&notice=inherited`);
  }

  async function saveException(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    const branchId = String(formData.get("branchId") ?? "");
    const staffId = String(formData.get("staffId") ?? "") || undefined;
    const date = String(formData.get("date") ?? "");
    const timeZone = String(formData.get("timeZone") ?? "Asia/Dushanbe");
    const available = formData.get("exceptionType") === "hours";
    try {
      await upsertScheduleException({
        businessId: current.businessId,
        actorUserId: current.userId,
        branchId,
        staffId,
        startsAt: localDateTimeToUtc(date, available ? String(formData.get("exceptionStartsAt") ?? "") : "00:00", timeZone),
        endsAt: localDateTimeToUtc(available ? date : addDays(date, 1), available ? String(formData.get("exceptionEndsAt") ?? "") : "00:00", timeZone),
        available,
        note: String(formData.get("note") ?? ""),
      });
    } catch (error) {
      redirect(`/dashboard/settings/schedule?${targetQuery(branchId, staffId)}&error=${errorCode(error)}`);
    }
    redirect(`/dashboard/settings/schedule?${targetQuery(branchId, staffId)}&notice=exception`);
  }

  async function removeException(formData: FormData) {
    "use server";
    const current = await requireBusinessAdmin();
    await removeScheduleException({ businessId: current.businessId, actorUserId: current.userId, exceptionId: String(formData.get("exceptionId") ?? "") });
    redirect(`/dashboard/settings/schedule?${targetQuery(String(formData.get("branchId") ?? ""), String(formData.get("staffId") ?? "") || undefined)}&notice=removed`);
  }

  const editorRules = selectedStaff && staffRules.length ? staffRules : selectedStaff ? branchRules : branchRules;
  const editorBreaks = selectedStaff && staffRules.length ? staffBreaks : selectedStaff ? branchBreaks : branchBreaks;
  return (
    <EntityListPage title="Расписание" description="Рабочие часы филиала, личные графики специалистов и изменения на отдельные даты." notice={noticeMessage(query.notice)} error={errorMessage(query.error)}>
      <form className="flex flex-wrap items-end gap-3" method="get">
        <Field label="Филиал">
          <Select name="branch" defaultValue={branch.id} className="w-auto">
            {branches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Чей график">
          <Select name="staff" defaultValue={selectedStaff?.id ?? ""} className="w-auto">
            <option value="">Филиал целиком</option>
            {staff.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="secondary">
          Показать график
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        <strong className="text-foreground">{selectedStaff ? selectedStaff.displayName : branch.name}</strong> · Часовой пояс: {branch.timeZone}
      </p>
      <ScheduleEditor mode={selectedStaff ? "staff" : "branch"} inherited={Boolean(selectedStaff && !staffRules.length)} rules={editorRules} breaks={editorBreaks} action={saveSchedule} restoreAction={selectedStaff ? restoreInheritance : undefined} error={errorMessage(query.error)} branchId={branch.id} staffId={selectedStaff?.id} />
      <section className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Отдельные даты</p>
          <h2 className="text-lg font-semibold text-foreground">Выходной или особые часы</h2>
          <p className="text-sm text-muted-foreground">Например, праздник, отпуск или сокращённый рабочий день.</p>
        </div>
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-5">
            <form action={saveException} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="branchId" value={branch.id} />
              <input type="hidden" name="staffId" value={selectedStaff?.id ?? ""} />
              <input type="hidden" name="timeZone" value={branch.timeZone} />
              <Field label="Дата">
                <Input type="date" name="date" min={todayInTimeZone(branch.timeZone)} required />
              </Field>
              <fieldset className="flex items-center gap-3">
                <legend className="sr-only">Режим</legend>
                <label className="flex items-center gap-1.5 text-sm text-foreground">
                  <input type="radio" name="exceptionType" value="off" defaultChecked /> Выходной
                </label>
                <label className="flex items-center gap-1.5 text-sm text-foreground">
                  <input type="radio" name="exceptionType" value="hours" /> Особые часы
                </label>
              </fieldset>
              <Field label="Начало особых часов">
                <Input type="time" name="exceptionStartsAt" defaultValue="10:00" />
              </Field>
              <Field label="Конец особых часов">
                <Input type="time" name="exceptionEndsAt" defaultValue="16:00" />
              </Field>
              <Field label="Комментарий">
                <Input name="note" maxLength={240} placeholder="Например, праздник" />
              </Field>
              <SubmitButton idle="Добавить изменение" pending="Добавляем" />
            </form>
          </CardContent>
        </Card>
        {exceptions.length ? (
          <div className="flex flex-col gap-2">
            {exceptions.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-md border border-border px-4 py-3 text-sm">
                <div className="flex flex-col">
                  <strong className="text-foreground">{formatExceptionDate(item.startsAt, branch.timeZone)}</strong>
                  <span className="text-muted-foreground">
                    {item.available ? "Особые рабочие часы" : "Выходной"}
                    {item.note ? ` · ${item.note}` : ""}
                  </span>
                </div>
                <form action={removeException}>
                  <input type="hidden" name="exceptionId" value={item.id} />
                  <input type="hidden" name="branchId" value={branch.id} />
                  <input type="hidden" name="staffId" value={selectedStaff?.id ?? ""} />
                  <SubmitButton variant="secondary" idle="Убрать" pending="Убираем" />
                </form>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Изменений на будущие даты пока нет" />
        )}
      </section>
    </EntityListPage>
  );
}

function scheduleValues(formData: FormData): { rules: Interval[]; breaks: Interval[] } {
  const rules: Interval[] = [];
  const breaks: Interval[] = [];
  for (let day = 0; day < 7; day += 1) {
    if (formData.get(`enabled-${day}`) === "true") rules.push({ dayOfWeek: day, startsAt: String(formData.get(`startsAt-${day}`) ?? ""), endsAt: String(formData.get(`endsAt-${day}`) ?? "") });
    if (formData.get(`breakEnabled-${day}`) === "true") breaks.push({ dayOfWeek: day, startsAt: String(formData.get(`breakStartsAt-${day}`) ?? ""), endsAt: String(formData.get(`breakEndsAt-${day}`) ?? "") });
  }
  return { rules, breaks };
}

function targetQuery(branchId: string, staffId?: string) { return `branch=${encodeURIComponent(branchId)}${staffId ? `&staff=${encodeURIComponent(staffId)}` : ""}`; }
function errorCode(error: unknown) { return error instanceof SettingsError ? error.code : "INVALID_INPUT"; }
function errorMessage(code?: string) { return ({ INVALID_INPUT: "Проверьте время: конец должен быть позже начала, а перерыв должен находиться внутри рабочего дня.", NOT_FOUND: "Филиал или специалист больше недоступен." } as Record<string, string>)[code ?? ""]; }
function noticeMessage(code?: string) { return ({ saved: "Расписание сохранено", inherited: "Специалист снова использует график филиала", exception: "Изменение даты добавлено", removed: "Изменение даты удалено" } as Record<string, string>)[code ?? ""]; }
function addDays(date: string, count: number) { const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + count); return value.toISOString().slice(0, 10); }
function formatExceptionDate(date: Date, timeZone: string) { return new Intl.DateTimeFormat("ru-TJ", { timeZone, dateStyle: "long", timeStyle: "short" }).format(date); }
