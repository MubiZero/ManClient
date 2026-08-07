# Booking Operations Implementation Plan

> **Статус на 2026-08-07: реализовано.** Сверено с кодом; `pnpm lint`, `pnpm typecheck` и `pnpm vitest run tests/unit tests/integration` (113 файлов, 474 теста) проходят.

**Goal:** Превратить раздел записей в рабочее место бизнеса: находить записи по дню и параметрам, создавать вручную, открывать полную карточку, подтверждать, переносить и отменять без нарушения tenant isolation и занятости.

**Architecture:** Чтение и все переходы статусов проходят через `src/core/booking-operations`, где повторно проверяются membership, роль, `businessId`, актуальное состояние и доступность. Server actions страниц остаются адаптерами. Существующие customer-facing `createPendingBooking`, `rescheduleBooking` и `cancelBooking` не смешиваются с business actor flow, но переиспользуются общие availability, conflict и audit boundaries.

**Tech Stack:** Next.js App Router, React 19, Prisma/PostgreSQL, Zod, Vitest, Playwright.

## Constraints

- OWNER/ADMIN видят все записи своего бизнеса; STAFF только назначенные себе.
- Ни один ID из URL/form не считается доверенным.
- Активные записи: `PENDING_PAYMENT`, `CONFIRMED`; отменённые и истёкшие остаются в истории.
- Ручная запись создаётся `CONFIRMED`, получает честный `Payment.PENDING` без фиктивного чека и audit event с business actor.
- Подтверждение pending-записи не подделывает банковскую проверку; это явное ручное действие бизнеса с отдельным audit event.
- Перенос сначала проверяет effective schedule и конфликты, старое время сохраняется при ошибке.
- Даты форматируются в timezone филиала; фильтры живут в URL.
- Не публиковать массовые/пакетные действия в этой волне.

### Task 0: Preserve booking source and business action state

**Files:** Prisma schema and additive migration, booking allocation/payment confirmation.

- [x] Add `BookingSource`, nullable expiry, confirmation actor/time and cancellation reason.
- [x] Backfill receipt confirmation time without inventing receipt data.
- [x] Make web and Telegram booking source explicit and keep old callers compatible.

### Task 1: Domain contracts and tenant-aware reads

**Files:**
- Create `src/core/booking-operations/booking-operation-error.ts`
- Create `src/core/booking-operations/booking-operation-schemas.ts`
- Create `src/core/booking-operations/booking-query-service.ts`
- Test `tests/unit/booking-operations/schemas.test.ts`
- Test `tests/integration/booking-operations/query.test.ts`

- [x] Validate URL filters: local `date`, `view`, status, branch, staff and trimmed search.
- [x] Implement paged list query with tenant and STAFF scope in SQL, not client filtering.
- [x] Implement detail query with the same scope and audit timeline.
- [x] Return filter counts and safe DTOs, not raw unrelated tenant data.
- [x] Test OWNER/ADMIN, STAFF restriction, search by name/phone and cross-tenant IDs.

### Task 2: Business booking transitions

**Files:**
- Create `src/core/booking-operations/booking-command-service.ts`
- Test `tests/integration/booking-operations/commands.test.ts`

- [x] Implement `createManualBooking` using service configuration, customer upsert, availability and serializable conflict check; create `CONFIRMED` booking with `Payment.PENDING` and audit without fake receipt data.
- [x] Implement idempotent `confirmBooking` only for business-owned `PENDING_PAYMENT`, with `booking.confirmed_manually` audit.
- [x] Implement `rescheduleBusinessBooking` with availability, `excludeBookingId`, conflict recheck and audit.
- [x] Implement `cancelBusinessBooking` through the existing cancellation boundary with membership actor and stable errors.
- [x] Schedule reminders after successful confirmation/manual create/reschedule where applicable.
- [x] Test stale status, conflict, STAFF ownership, cross-tenant ID and audit metadata.

### Task 3: Shared booking UI components

**Files:**
- Create `src/features/dashboard/bookings/booking-filters.tsx`
- Create `src/features/dashboard/bookings/booking-list.tsx`
- Create `src/features/dashboard/bookings/booking-status.tsx`
- Create `src/features/dashboard/bookings/booking-summary.tsx`
- Test `tests/unit/dashboard/booking-components.test.tsx`

- [x] Add accessible date/status/branch/staff/search filters that submit to URL.
- [x] Build compact desktop list and mobile cards with customer, phone, service, staff, branch, time, payment and booking status.
- [x] Distinguish first-use empty state from no filter results.
- [x] Every row opens a real detail route; keyboard focus and 320 px layout are verified.

### Task 4: List/day views and detail route

**Files:**
- Replace `src/app/(dashboard)/dashboard/bookings/page.tsx`
- Create `src/app/(dashboard)/dashboard/bookings/[bookingId]/page.tsx`
- Create `src/app/(dashboard)/dashboard/bookings/[bookingId]/loading.tsx`
- Modify `src/app/globals.css`
- Test `tests/e2e/booking-operations.spec.ts`

- [x] Implement today/day/list URL views with previous/today/next navigation and result count.
- [x] Preserve filters in links and show active filter reset.
- [x] Detail shows full allowed context, safe payment status, resource allocation and audit timeline.
- [x] STAFF receives not-found/recovery for a booking assigned to someone else.

### Task 5: Manual booking flow

**Files:**
- Create `src/app/(dashboard)/dashboard/bookings/new/page.tsx`
- Create `src/features/dashboard/bookings/manual-booking-form.tsx`
- Test `tests/unit/dashboard/manual-booking-form.test.tsx`
- Extend `tests/e2e/booking-operations.spec.ts`

- [x] Select branch, published service, eligible specialist, date and available slot.
- [x] Reuse `/api/availability` for slot feedback; service-required resources are automatic.
- [x] Normalize `+992` phone and show field-level errors.
- [x] Protect against double-submit and redirect to the created booking detail.

### Task 6: Confirm, reschedule and cancel surfaces

**Files:**
- Create `src/features/dashboard/bookings/booking-actions.tsx`
- Create `src/features/dashboard/bookings/business-reschedule-form.tsx`
- Modify booking detail page
- Extend `tests/e2e/booking-operations.spec.ts`

- [x] Show only transitions valid for current status and role.
- [x] Confirmation dialog explicitly says this is manual and does not mark bank verification.
- [x] Reschedule dialog/page keeps current appointment until success and displays conflict recovery.
- [x] Cancellation confirmation includes customer, service and current local time.
- [x] Result notices are stable across redirect and double-clicks do not duplicate audit events.

### Task 7: Dashboard usefulness and route states

**Files:**
- Modify `src/app/(dashboard)/dashboard/page.tsx`
- Create `src/features/dashboard/bookings/today-agenda.tsx`
- Modify dashboard loading state and CSS
- Test `tests/unit/dashboard/today-agenda.test.tsx`

- [x] Overview counts today in business timezone, not all historical bookings.
- [x] Show next active appointments and pending/manual-attention counts with direct actions.
- [x] Empty agenda links to manual booking and public booking link.

### Task 8: Release gate and runbook

**Files:**
- Modify `docs/pilot-runbook.md`
- Finalize `tests/e2e/booking-operations.spec.ts`

- [x] Run all unit/integration tests, lint, typecheck and production build.
- [x] Run booking operations, RBAC, public booking and business settings E2E.
- [x] Verify 320, 390, 768 and 1440 widths without horizontal overflow.
- [x] Document owner smoke for manual create, confirm, reschedule, cancel and audit.
- [x] Commit only the booking-operations wave; do not push or deploy without explicit permission.
