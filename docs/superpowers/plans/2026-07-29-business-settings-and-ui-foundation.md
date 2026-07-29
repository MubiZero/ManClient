# Business Settings and UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать кабинет ManClient полноценным responsive-инструментом и реализовать полный рабочий lifecycle филиалов, услуг, сотрудников, ресурсов и расписания.

**Architecture:** UI строится из небольших общих примитивов и единого app shell. Изменения сущностей проходят через tenant-aware доменные сервисы, а server actions остаются тонкими адаптерами страниц. Исторически используемые сущности архивируются вместо физического удаления; доступность продолжает вычисляться текущим availability service из опубликованных активных данных и правил расписания.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Prisma 7/PostgreSQL, Zod 4, CSS modules through the existing global token system, Vitest 4, Playwright 1.58.

## Global Constraints

- Сохранить зелёную идентичность ManClient и один визуальный язык на всех поверхностях.
- Обычный текст на клиентских экранах не меньше 16 px; отступы кратны 4 px.
- Контраст текста не ниже 4.5:1, границ и focus-индикаторов не ниже 3:1; mobile targets не меньше 44×44 px.
- Каждый control имеет default, hover, pressed, focus-visible, disabled, loading и error состояния.
- Mobile кабинет не скрывает настройки или выход.
- Каждая мутация проверяет роль и `businessId`; STAFF не получает административные действия.
- Сущности с историей архивируются, а не удаляются каскадно.
- Все суммы хранятся в дирам, даты доступности вычисляются в timezone филиала.
- Не публиковать control без рабочего действия, результата и recovery path.
- Все пользовательские строки на русском; не использовать em dash и технические названия там, где есть понятное предметное слово.

---

## Planned File Structure

### Общая UI-система

- Create `src/features/ui/button.tsx`: button/link variants и loading state.
- Create `src/features/ui/field.tsx`: label, hint, inline error и ARIA wiring.
- Create `src/features/ui/status-badge.tsx`: семантические статусы.
- Create `src/features/ui/empty-state.tsx`: единое first-use/filtered empty state.
- Create `src/features/ui/dialog.tsx`: доступное подтверждение архивирования.
- Create `src/features/ui/submit-button.tsx`: `useFormStatus` и защита от double-submit.
- Create `src/features/dashboard/dashboard-nav.tsx`: active desktop/mobile navigation.
- Modify `src/app/globals.css`: токены, UI primitives, responsive shell, forms, lists and dialogs.
- Modify `src/app/(dashboard)/dashboard/layout.tsx`: новый shell и полная mobile navigation.

### Домен настроек

- Create `src/core/business-settings/settings-error.ts`: стабильные domain error codes.
- Create `src/core/business-settings/authorize-settings.ts`: OWNER/ADMIN tenant authorization.
- Create `src/core/business-settings/branch-service.ts`: branch create/update/archive.
- Create `src/core/business-settings/service-service.ts`: service create/update/archive and assignments.
- Create `src/core/business-settings/staff-service.ts`: specialist create/update/archive independent from login.
- Create `src/core/business-settings/resource-service.ts`: resource create/update/archive.
- Create `src/core/business-settings/schedule-service.ts`: weekly rules and exceptions.
- Create `src/core/business-settings/setting-schemas.ts`: shared Zod schemas and normalized values.
- Create `src/core/formatting/money.ts`: TJS formatting and form conversion.
- Create `src/core/formatting/dushanbe-date.ts`: timezone-safe local date helpers.

### Страницы и формы

- Create `src/features/dashboard/entity-list-page.tsx`: heading, action, filters and empty state frame.
- Create `src/features/dashboard/branch-form.tsx`.
- Create `src/features/dashboard/service-form.tsx`.
- Create `src/features/dashboard/staff-form.tsx`.
- Create `src/features/dashboard/resource-form.tsx`.
- Create `src/features/dashboard/schedule-editor.tsx`.
- Modify each route below to use explicit server actions and forms.
- Create `src/app/(dashboard)/dashboard/settings/schedule/page.tsx`.

### Data and verification

- Modify `prisma/schema.prisma`.
- Create `prisma/migrations/20260729170000_complete_business_settings/migration.sql`.
- Add integration tests under `tests/integration/business-settings/`.
- Add unit tests under `tests/unit/ui/` and `tests/unit/formatting/`.
- Add `tests/e2e/business-settings.spec.ts` and extend dashboard mobile coverage.

---

### Task 1: Extend the data model without losing history

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260729170000_complete_business_settings/migration.sql`
- Test: `tests/integration/business-settings/schema.test.ts`

**Interfaces:**
- Produces: nullable `archivedAt` on Branch, Service, StaffMember and Resource.
- Produces: Branch `address`, `phone`; Service `description`, `isPublished`; StaffMember `businessId` and optional `membershipId`; Resource `kind`, `capacity`, `isAvailable`.
- Produces: multi-branch `StaffBranch`, `StaffScheduleRule`, `ScheduleBreak` and `ScheduleException` models consumed by settings and availability services.

- [ ] **Step 1: Write the failing schema integration test**

```ts
it("stores an active specialist without granting dashboard access", async () => {
  const staff = await prisma.staffMember.create({
    data: {
      businessId,
      displayName: "Фирдавс Каримов",
      branches: { create: { branchId, isPrimary: true } },
    },
  });
  expect(staff.membershipId).toBeNull();
  expect(staff.archivedAt).toBeNull();
});

it("stores branch, service, resource and schedule configuration", async () => {
  const branch = await prisma.branch.update({
    where: { id: branchId },
    data: { address: "Рудаки, 42", phone: "+992900001122" },
  });
  const rule = await prisma.staffScheduleRule.create({
    data: { staffId, branchId, dayOfWeek: 1, startsAt: "09:00", endsAt: "18:00" },
  });
  expect(branch.address).toBe("Рудаки, 42");
  expect(rule.dayOfWeek).toBe(1);
});
```

- [ ] **Step 2: Run the test to verify the generated client lacks these fields**

Run: `DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm vitest run tests/integration/business-settings/schema.test.ts`

Expected: FAIL during typecheck or Prisma operation because the new fields/models do not exist.

- [ ] **Step 3: Extend Prisma models and relations**

```prisma
model StaffMember {
  businessId   String
  membershipId String?   @unique
  displayName  String
  phone        String?
  archivedAt   DateTime?
  business     Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  branches     StaffBranch[]
  scheduleRules StaffScheduleRule[]
  scheduleBreaks ScheduleBreak[]
  scheduleExceptions ScheduleException[]
  // existing service and booking relations remain; remove direct branchId after backfill
}

model StaffBranch {
  staffId    String
  branchId   String
  isPrimary  Boolean     @default(false)
  staff      StaffMember @relation(fields: [staffId], references: [id], onDelete: Cascade)
  branch     Branch      @relation(fields: [branchId], references: [id], onDelete: Cascade)
  @@id([staffId, branchId])
  @@index([branchId])
}

model Service {
  description String?
  isPublished Boolean   @default(false)
  archivedAt  DateTime?
  // existing fields and relations remain
}

model Resource {
  kind       String   @default("OTHER")
  capacity   Int      @default(1)
  isAvailable Boolean @default(true)
  archivedAt DateTime?
  // existing fields and relations remain
}

model StaffScheduleRule {
  id        String      @id @default(cuid())
  staffId   String
  branchId  String
  dayOfWeek Int
  startsAt  String
  endsAt    String
  staff     StaffMember @relation(fields: [staffId], references: [id], onDelete: Cascade)
  branch    Branch      @relation(fields: [branchId], references: [id], onDelete: Cascade)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  @@index([staffId, branchId, dayOfWeek])
}

model ScheduleBreak {
  id        String       @id @default(cuid())
  branchId  String
  staffId   String?
  dayOfWeek Int
  startsAt  String
  endsAt    String
  branch    Branch       @relation(fields: [branchId], references: [id], onDelete: Cascade)
  staff     StaffMember? @relation(fields: [staffId], references: [id], onDelete: Cascade)
  @@index([branchId, dayOfWeek])
  @@index([staffId, dayOfWeek])
}

model ScheduleException {
  id        String       @id @default(cuid())
  branchId  String
  staffId   String?
  startsAt  DateTime
  endsAt    DateTime
  available Boolean      @default(false)
  note      String?
  branch    Branch       @relation(fields: [branchId], references: [id], onDelete: Cascade)
  staff     StaffMember? @relation(fields: [staffId], references: [id], onDelete: Cascade)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  @@index([branchId, startsAt, endsAt])
  @@index([staffId, startsAt, endsAt])
}
```

Add nullable `address`, `phone`, `archivedAt` to Branch and relations from Business/Branch to the new models. Backfill `StaffMember.businessId` through Membership, create one `StaffBranch` from every existing direct `branchId` with `isPrimary = true`, then make `businessId` required and remove the direct `StaffMember.branchId`. Preserve existing `BusinessScheduleRule` during migration; it remains the branch default and is not silently copied into staff rules. Write explicit `ALTER TABLE` statements and foreign keys in the migration.

- [ ] **Step 4: Generate Prisma Client, apply migration and pass the test**

Run: `DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm prisma migrate dev && DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm vitest run tests/integration/business-settings/schema.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the schema change**

```bash
git add prisma/schema.prisma prisma/migrations tests/integration/business-settings/schema.test.ts
git commit -m "feat: model complete business settings"
```

### Task 2: Add shared formatting and validation boundaries

**Files:**
- Create: `src/core/business-settings/setting-schemas.ts`
- Create: `src/core/business-settings/settings-error.ts`
- Create: `src/core/formatting/money.ts`
- Create: `src/core/formatting/dushanbe-date.ts`
- Test: `tests/unit/business-settings/setting-schemas.test.ts`
- Test: `tests/unit/formatting/money.test.ts`
- Test: `tests/unit/formatting/dushanbe-date.test.ts`

**Interfaces:**
- Produces: `branchInputSchema`, `serviceInputSchema`, `staffInputSchema`, `resourceInputSchema`, `weeklyScheduleSchema`.
- Produces: `parseSomoniToDiram(value: string): number`, `formatSomoni(amountDiram: number, locale?: "ru-TJ" | "tg-TJ"): string`.
- Produces: `todayInTimeZone(timeZone: string): string` and `SettingsError` with stable codes.

- [ ] **Step 1: Write failing tests for valid and invalid domain input**

```ts
expect(parseSomoniToDiram("50,25")).toBe(5025);
expect(formatSomoni(5025)).toContain("50,25");
expect(() => parseSomoniToDiram("-1")).toThrow("INVALID_AMOUNT");
expect(serviceInputSchema.safeParse({
  name: "Стрижка", description: "", durationMinutes: "45", amountSomoni: "50",
  branchId: "branch", staffIds: ["staff"], resourceIds: [], isPublished: true,
}).success).toBe(true);
```

- [ ] **Step 2: Run tests and verify missing-module failures**

Run: `pnpm vitest run tests/unit/business-settings/setting-schemas.test.ts tests/unit/formatting`

Expected: FAIL because modules are missing.

- [ ] **Step 3: Implement strict Zod schemas and formatters**

```ts
export function parseSomoniToDiram(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)) throw new SettingsError("INVALID_AMOUNT");
  const amount = Math.round(Number(normalized) * 100);
  if (amount < 1) throw new SettingsError("INVALID_AMOUNT");
  return amount;
}
```

Use `Intl.NumberFormat(locale, { style: "currency", currency: "TJS" })` for display. Validate `HH:mm`, weekday 0–6, duration 5–720, capacity 1–100, Tajik phone normalization, unique ID arrays and trim all names.

- [ ] **Step 4: Run targeted unit tests**

Run: `pnpm vitest run tests/unit/business-settings/setting-schemas.test.ts tests/unit/formatting`

Expected: PASS.

- [ ] **Step 5: Commit validation and formatting**

```bash
git add src/core/business-settings src/core/formatting tests/unit/business-settings tests/unit/formatting
git commit -m "feat: add business settings contracts"
```

### Task 3: Build the tenant-aware settings service boundary

**Files:**
- Create: `src/core/business-settings/authorize-settings.ts`
- Create: `src/core/business-settings/branch-service.ts`
- Create: `src/core/business-settings/service-service.ts`
- Create: `src/core/business-settings/staff-service.ts`
- Create: `src/core/business-settings/resource-service.ts`
- Test: `tests/integration/business-settings/authorization.test.ts`
- Test: `tests/integration/business-settings/entity-lifecycle.test.ts`

**Interfaces:**
- Consumes: schemas and `SettingsError` from Task 2.
- Produces: create/update/archive/restore operations for branches, services, staff and resources, plus `duplicateService`.
- Every function accepts `{ businessId, actorUserId, ...entityInput }` and returns the mutated entity identifier plus `archivedAt` when relevant.

- [ ] **Step 1: Write failing lifecycle and tenant-isolation tests**

```ts
await expect(updateService({
  businessId: otherBusiness.id, actorUserId: owner.userId, serviceId,
  name: "Чужая услуга", description: "", durationMinutes: "45",
  amountSomoni: "50", branchId: otherBranch.id, staffIds: [], resourceIds: [], isPublished: false,
})).rejects.toMatchObject({ code: "FORBIDDEN" });

const archived = await archiveResource({ businessId, actorUserId, resourceId });
expect(archived.archivedAt).toBeInstanceOf(Date);
await expect(prisma.booking.findUnique({ where: { id: historicalBookingId } })).resolves.not.toBeNull();
```

- [ ] **Step 2: Run tests and verify missing-service failures**

Run: `DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm vitest run tests/integration/business-settings/authorization.test.ts tests/integration/business-settings/entity-lifecycle.test.ts`

Expected: FAIL because services are missing.

- [ ] **Step 3: Implement one authorization helper and transactional services**

```ts
export async function requireSettingsAccess(
  tx: Prisma.TransactionClient,
  input: { businessId: string; actorUserId: string },
) {
  const membership = await tx.membership.findUnique({
    where: { businessId_userId: { businessId: input.businessId, userId: input.actorUserId } },
    select: { role: true },
  });
  if (!membership || membership.role === "STAFF") throw new SettingsError("FORBIDDEN");
  return membership;
}
```

Use serializable transactions for multi-relation updates. Every entity lookup includes `businessId`; relation IDs are rechecked against the same tenant. Staff updates replace `StaffBranch` assignments atomically and require exactly one primary branch. `isPublished: true` requires at least one active assigned staff member in the service branch and one effective schedule source. Archive operations first return impact; confirmation rejects entities with future active bookings using `SettingsError("FUTURE_BOOKINGS")`. Restore operations are explicit and idempotent.

- [ ] **Step 4: Run integration tests**

Run: `DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm vitest run tests/integration/business-settings`

Expected: PASS, including STAFF rejection and cross-tenant mutation rejection.

- [ ] **Step 5: Commit domain services**

```bash
git add src/core/business-settings tests/integration/business-settings
git commit -m "feat: add business settings lifecycle"
```

### Task 4: Make schedule editing real and availability-aware

**Files:**
- Create: `src/core/business-settings/schedule-service.ts`
- Modify: `src/core/availability/availability-service.ts`
- Test: `tests/integration/business-settings/schedule.test.ts`
- Modify: `tests/integration/availability/availability-service.test.ts`

**Interfaces:**
- Consumes: `weeklyScheduleSchema`, `requireSettingsAccess`.
- Produces: `replaceBranchSchedule(input)`, `replaceStaffSchedule(input)`, `upsertScheduleException(input)`, `removeScheduleException(input)`; weekly inputs include work intervals and breaks.
- Availability resolves staff exception first, staff weekly rule second, branch rule last; archived staff/resources and unpublished services yield no slots.

- [ ] **Step 1: Write failing precedence and exception tests**

```ts
it("uses a staff day off before branch working hours", async () => {
  await upsertScheduleException({ businessId, actorUserId, staffId, date: "2026-08-03", available: false });
  await expect(getAvailableStarts({ branchId, serviceId, staffId, date: "2026-08-03" })).resolves.toEqual([]);
});

it("uses staff hours before branch defaults", async () => {
  await replaceStaffSchedule({ businessId, actorUserId, staffId, rules: [{ dayOfWeek: 1, startsAt: "12:00", endsAt: "16:00" }] });
  const starts = await getAvailableStarts({ branchId, serviceId, staffId, date: "2026-08-03" });
  expect(starts[0]).toContain("12:00");
});
```

- [ ] **Step 2: Run tests and verify the old branch-only behavior fails**

Run: `DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm vitest run tests/integration/business-settings/schedule.test.ts tests/integration/availability/availability-service.test.ts`

Expected: FAIL because staff rules and exceptions are ignored.

- [ ] **Step 3: Implement atomic replace operations and availability precedence**

Inside one transaction, delete and recreate the actor-authorized rule set and breaks after validating no overlaps and `startsAt < endsAt`. In availability queries require `service.archivedAt = null`, `service.isPublished = true`, `staff.archivedAt = null`, a `StaffBranch` assignment for the selected branch, and active required resources. Subtract branch/staff breaks, apply branch/staff exceptions, and convert the requested local date using the branch timezone before querying exceptions.

- [ ] **Step 4: Run schedule and availability tests**

Run: `DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm vitest run tests/integration/business-settings/schedule.test.ts tests/integration/availability/availability-service.test.ts tests/integration/bookings/allocation.test.ts`

Expected: PASS without changing existing collision protection.

- [ ] **Step 5: Commit scheduling**

```bash
git add src/core/business-settings/schedule-service.ts src/core/availability/availability-service.ts tests/integration/business-settings/schedule.test.ts tests/integration/availability/availability-service.test.ts
git commit -m "feat: add editable staff schedules"
```

### Task 5: Establish the reusable UI foundation

**Files:**
- Create: `src/features/ui/button.tsx`
- Create: `src/features/ui/field.tsx`
- Create: `src/features/ui/status-badge.tsx`
- Create: `src/features/ui/empty-state.tsx`
- Create: `src/features/ui/dialog.tsx`
- Create: `src/features/ui/submit-button.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/unit/ui/primitives.test.tsx`

**Interfaces:**
- Produces: `Button`, `LinkButton`, `Field`, `StatusBadge`, `EmptyState`, `Dialog`, `SubmitButton`.
- Components accept semantic props and never import business-setting services.

- [ ] **Step 1: Write failing accessibility and state tests**

```tsx
const html = renderToStaticMarkup(<Field label="Название" name="name" error="Введите название" />);
expect(html).toContain('aria-invalid="true"');
expect(html).toContain('role="alert"');

const button = renderToStaticMarkup(<Button loading>Сохранить услугу</Button>);
expect(button).toContain("Сохраняем");
expect(button).toContain("disabled");
```

- [ ] **Step 2: Run test and verify components are missing**

Run: `pnpm vitest run tests/unit/ui/primitives.test.tsx`

Expected: FAIL with unresolved modules.

- [ ] **Step 3: Implement semantic primitives and tokenized CSS**

```tsx
export function SubmitButton({ idle, pending }: { idle: string; pending: string }) {
  const { pending: isPending } = useFormStatus();
  return <Button type="submit" loading={isPending} loadingLabel={pending}>{idle}</Button>;
}
```

Add tokens for semantic surfaces, layered shadows, 4 px spacing, motion durations and z-index roles. Gate hover rules with `@media (hover: hover)`, preserve `focus-visible`, use `touch-action: manipulation`, and retain reduced-motion behavior. Dialog uses native `<dialog>` semantics or an equivalent keyboard-operable implementation with labelled title, initial focus and Escape close.

- [ ] **Step 4: Run UI unit tests and lint**

Run: `pnpm vitest run tests/unit/ui/primitives.test.tsx && pnpm lint`

Expected: PASS.

- [ ] **Step 5: Commit UI primitives**

```bash
git add src/features/ui src/app/globals.css tests/unit/ui
git commit -m "feat: add dashboard ui foundation"
```

### Task 6: Replace the incomplete dashboard navigation

**Files:**
- Create: `src/features/dashboard/dashboard-nav.tsx`
- Modify: `src/app/(dashboard)/dashboard/layout.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/unit/dashboard/navigation.test.tsx`
- Modify: `tests/e2e/dashboard-rbac.spec.ts`

**Interfaces:**
- Consumes: `LinkButton` and shared tokens from Task 5.
- Produces: role-filtered desktop sidebar, mobile primary bar and mobile settings drawer with active state.

- [ ] **Step 1: Write failing navigation tests**

```tsx
expect(renderNavigation({ role: "OWNER", pathname: "/dashboard/settings/services" })).toContain('aria-current="page"');
expect(renderNavigation({ role: "OWNER", mobile: true })).toContain("Услуги");
expect(renderNavigation({ role: "STAFF", mobile: true })).not.toContain("Настройки бизнеса");
```

Extend Playwright to use a mobile viewport and assert that owner can open settings and sign out without changing viewport.

- [ ] **Step 2: Run tests and verify current mobile settings are absent**

Run: `pnpm vitest run tests/unit/dashboard/navigation.test.tsx && DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm playwright test tests/e2e/dashboard-rbac.spec.ts --project=chromium`

Expected: FAIL because current CSS hides settings and sign-out on mobile.

- [ ] **Step 3: Implement active and responsive navigation**

Use `usePathname()` only in `dashboard-nav.tsx`. Keep membership data server-provided. Mobile bottom bar exposes Overview, Bookings and Menu; Menu opens a labelled drawer with all role-allowed routes and Sign out. Desktop sidebar stays sticky. Use `aria-current="page"` for exact or nested path matches.

- [ ] **Step 4: Run navigation unit/E2E tests**

Run: `pnpm vitest run tests/unit/dashboard/navigation.test.tsx && DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm playwright test tests/e2e/dashboard-rbac.spec.ts`

Expected: PASS at desktop and mobile sizes.

- [ ] **Step 5: Commit navigation**

```bash
git add src/features/dashboard/dashboard-nav.tsx 'src/app/(dashboard)/dashboard/layout.tsx' src/app/globals.css tests/unit/dashboard/navigation.test.tsx tests/e2e/dashboard-rbac.spec.ts
git commit -m "feat: make dashboard navigation complete"
```

### Task 7: Implement full branch management

**Files:**
- Create: `src/features/dashboard/entity-list-page.tsx`
- Create: `src/features/dashboard/branch-form.tsx`
- Modify: `src/app/(dashboard)/dashboard/settings/branches/page.tsx`
- Test: `tests/unit/dashboard/branch-form.test.tsx`
- Test: `tests/e2e/business-settings.spec.ts`

**Interfaces:**
- Consumes: branch services from Task 3 and UI primitives from Task 5.
- Produces: create/edit/archive flows with query states `?action=new`, `?edit=<id>`, `?archive=<id>`.

- [ ] **Step 1: Write failing page and form tests**

```tsx
expect(renderBranchForm()).toContain("Создать филиал");
expect(renderBranchForm({ error: "INVALID_PHONE" })).toContain('role="alert"');
```

E2E: owner creates “Сомони, 12”, edits phone and address, sees it in list, opens archive confirmation; STAFF route remains forbidden.

- [ ] **Step 2: Run targeted tests and verify missing controls**

Run: `pnpm vitest run tests/unit/dashboard/branch-form.test.tsx && DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm playwright test tests/e2e/business-settings.spec.ts -g "branch"`

Expected: FAIL because branch page supports rename only.

- [ ] **Step 3: Implement forms and thin server actions**

Each action calls `requireBusinessAdmin()`, passes `businessId` and `userId` to the domain service, catches only `SettingsError`, and redirects to a stable success/error query. The list shows address, phone, timezone, payment mask and publication readiness. Archive confirmation names the branch and displays future booking count returned by the service.

- [ ] **Step 4: Run branch tests**

Run: `DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm vitest run tests/unit/dashboard/branch-form.test.tsx tests/integration/business-settings && DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm playwright test tests/e2e/business-settings.spec.ts -g "branch"`

Expected: PASS.

- [ ] **Step 5: Commit branch management**

```bash
git add src/features/dashboard/entity-list-page.tsx src/features/dashboard/branch-form.tsx 'src/app/(dashboard)/dashboard/settings/branches/page.tsx' tests/unit/dashboard/branch-form.test.tsx tests/e2e/business-settings.spec.ts
git commit -m "feat: add complete branch management"
```

### Task 8: Implement service, staff and resource management

**Files:**
- Create: `src/features/dashboard/service-form.tsx`
- Create: `src/features/dashboard/staff-form.tsx`
- Create: `src/features/dashboard/resource-form.tsx`
- Modify: `src/app/(dashboard)/dashboard/settings/services/page.tsx`
- Modify: `src/app/(dashboard)/dashboard/settings/staff/page.tsx`
- Modify: `src/app/(dashboard)/dashboard/settings/resources/page.tsx`
- Test: `tests/unit/dashboard/settings-forms.test.tsx`
- Modify: `tests/e2e/business-settings.spec.ts`

**Interfaces:**
- Consumes: lifecycle services from Task 3, shared entity frame and UI primitives.
- Produces: full create/edit/archive/publish forms and association controls.

- [ ] **Step 1: Write failing form and user-flow tests**

```tsx
expect(renderServiceForm({ branches, staff, resources })).toContain("Опубликовать для клиентов");
expect(renderStaffForm({ branches, services })).toContain("Доступ в кабинет создаётся отдельно");
expect(renderResourceForm({ branches })).toContain("Вместимость");
```

E2E creates one specialist without login assigned to two branches, a lift resource, and a service linked to both; editing persists; archived entity disappears from the active list but remains in database history.

- [ ] **Step 2: Run tests and verify pages are read-only**

Run: `pnpm vitest run tests/unit/dashboard/settings-forms.test.tsx && DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm playwright test tests/e2e/business-settings.spec.ts -g "service|staff|resource"`

Expected: FAIL because forms and actions are absent.

- [ ] **Step 3: Implement responsive forms and server actions**

Use checkbox groups with `<fieldset><legend>` for staff/resource assignments. Service publication errors link to the missing staff or schedule screen. Lists include status, relevant relationships and one obvious primary action. Empty lists use `EmptyState` with a create action. Archive dialogs identify the entity and do not use generic Yes/No labels.

- [ ] **Step 4: Run settings tests**

Run: `DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm vitest run tests/unit/dashboard/settings-forms.test.tsx tests/integration/business-settings && DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm playwright test tests/e2e/business-settings.spec.ts -g "service|staff|resource"`

Expected: PASS.

- [ ] **Step 5: Commit entity management**

```bash
git add src/features/dashboard/service-form.tsx src/features/dashboard/staff-form.tsx src/features/dashboard/resource-form.tsx 'src/app/(dashboard)/dashboard/settings/services/page.tsx' 'src/app/(dashboard)/dashboard/settings/staff/page.tsx' 'src/app/(dashboard)/dashboard/settings/resources/page.tsx' tests/unit/dashboard/settings-forms.test.tsx tests/e2e/business-settings.spec.ts
git commit -m "feat: complete service team and resource settings"
```

### Task 9: Add the weekly schedule editor and readiness preview

**Files:**
- Create: `src/features/dashboard/schedule-editor.tsx`
- Create: `src/app/(dashboard)/dashboard/settings/schedule/page.tsx`
- Modify: `src/features/dashboard/dashboard-nav.tsx`
- Modify: `src/app/(dashboard)/dashboard/onboarding/page.tsx`
- Modify: `src/features/onboarding/onboarding-checklist.tsx`
- Test: `tests/unit/dashboard/schedule-editor.test.tsx`
- Modify: `tests/e2e/business-settings.spec.ts`

**Interfaces:**
- Consumes: schedule services from Task 4 and `todayInTimeZone` from Task 2.
- Produces: branch defaults, per-staff override and date exception editor; availability preview link/query.

- [ ] **Step 1: Write failing editor and onboarding readiness tests**

```tsx
expect(renderScheduleEditor({ mode: "branch", rules: [] })).toContain("Понедельник");
expect(renderScheduleEditor({ mode: "staff", inherited: true })).toContain("Используется график филиала");
expect(renderOnboardingChecklist({ hasSchedule: false })).toContain("Настроить расписание");
```

E2E copies Monday hours to weekdays, adds lunch split, marks one date off and verifies preview has no slot on that date.

- [ ] **Step 2: Run tests and verify the editor is absent**

Run: `pnpm vitest run tests/unit/dashboard/schedule-editor.test.tsx && DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm playwright test tests/e2e/business-settings.spec.ts -g "schedule"`

Expected: FAIL.

- [ ] **Step 3: Implement the editor and real readiness checklist**

Rows use enabled checkbox, start/end time inputs, add interval and copy action. Staff mode clearly shows inheritance and can restore it. Exceptions use a date field plus “Выходной” or custom hours. Onboarding no longer claims readiness until active service, active staff and an effective schedule exist; payment and Telegram remain separately visible readiness items.

- [ ] **Step 4: Run schedule UI, availability and E2E tests**

Run: `DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm vitest run tests/unit/dashboard/schedule-editor.test.tsx tests/integration/business-settings/schedule.test.ts tests/integration/availability/availability-service.test.ts && DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm playwright test tests/e2e/business-settings.spec.ts -g "schedule"`

Expected: PASS.

- [ ] **Step 5: Commit scheduling UI**

```bash
git add src/features/dashboard/schedule-editor.tsx 'src/app/(dashboard)/dashboard/settings/schedule/page.tsx' src/features/dashboard/dashboard-nav.tsx 'src/app/(dashboard)/dashboard/onboarding/page.tsx' src/features/onboarding/onboarding-checklist.tsx tests/unit/dashboard/schedule-editor.test.tsx tests/e2e/business-settings.spec.ts
git commit -m "feat: add business schedule editor"
```

### Task 10: Add route states and complete wave verification

**Files:**
- Create: `src/app/(dashboard)/dashboard/loading.tsx`
- Create: `src/app/(dashboard)/dashboard/error.tsx`
- Create: `src/app/(dashboard)/dashboard/settings/loading.tsx`
- Modify: `tests/e2e/business-settings.spec.ts`
- Modify: `docs/pilot-runbook.md`

**Interfaces:**
- Consumes: UI primitives and all completed settings flows.
- Produces: branded loading/error recovery and an updated operator runbook.

- [ ] **Step 1: Write failing route-state assertions**

```ts
await expect(page.getByRole("status", { name: /загружаем настройки/i })).toBeAttached();
await expect(page.getByRole("button", { name: "Повторить загрузку" })).toBeVisible();
```

Use a controlled test route/fetch interception for the error boundary rather than changing production data.

- [ ] **Step 2: Run the full E2E file and capture current missing states**

Run: `DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm playwright test tests/e2e/business-settings.spec.ts`

Expected: FAIL only on the new loading/error assertions.

- [ ] **Step 3: Implement route states and update the runbook**

Loading skeletons mirror headings, action and list rows without layout shift. Error boundary uses `reset()` and offers “Повторить загрузку” plus safe navigation to Overview. Runbook documents migration order, owner smoke path, mobile navigation check and rollback boundary.

- [ ] **Step 4: Run all verification gates**

Run:

```bash
DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm test
pnpm lint
pnpm typecheck
DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm build
DATABASE_URL=postgresql://manclient:manclient@127.0.0.1:5432/manclient pnpm playwright test tests/e2e/business-settings.spec.ts tests/e2e/dashboard-rbac.spec.ts tests/e2e/public-booking.spec.ts
```

Expected: all commands PASS. Existing public booking smoke remains green after publication filtering changes.

- [ ] **Step 5: Perform manual responsive and accessibility smoke**

Verify at 320, 390, 768 and 1440 CSS px: no horizontal scroll, mobile settings and sign-out remain reachable, dialogs trap and restore focus, all forms submit by keyboard, text survives 200% zoom, and archived records do not disappear from booking history.

- [ ] **Step 6: Commit wave verification and documentation**

```bash
git add 'src/app/(dashboard)/dashboard/loading.tsx' 'src/app/(dashboard)/dashboard/error.tsx' 'src/app/(dashboard)/dashboard/settings/loading.tsx' tests/e2e/business-settings.spec.ts docs/pilot-runbook.md
git commit -m "test: verify complete business settings"
```

---

## Subsequent Independent Plans

After this wave is green, create and execute separate detailed plans in this order:

1. `booking-operations`: day/week/list, search, URL filters, manual create, confirm, reschedule, cancel and audit.
2. `payment-status-and-review`: durable pending-payment page, direct web receipt upload, status polling and review inbox.
3. `business-telegram-assistant`: onboarding, secure chat link, useful command menu and actionable notifications.
4. `public-booking-wizard`: compact wizard, summary, any-available staff, timezone-safe dates and recovery states.
5. `customer-change-flows`: complete reschedule/cancel pages and expired-link recovery.
6. `client-telegram-experience`: compact keyboards, back/restart, immediate OCR acknowledgement and cancel confirmation.
7. `marketing-auth-localization-qa`: honest landing, phone-first auth recovery, real ru/tg catalogs and final cross-surface accessibility/visual QA.

These are intentionally separate plans because each changes an independent domain boundary and must produce independently testable working software.
