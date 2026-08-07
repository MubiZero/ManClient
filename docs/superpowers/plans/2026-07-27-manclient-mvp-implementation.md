# ManClient MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Статус на 2026-08-07: реализовано.** Сверено с кодом; `pnpm lint`, `pnpm typecheck` и `pnpm vitest run tests/unit tests/integration` (113 файлов, 474 теста) проходят.
>
> Расхождения с планом: Страницы настроек созданы по одной на раздел: `branches`, `services`, `staff`, `resources` — план записывал их одной строкой с brace expansion.

**Goal:** Build a pilot-ready B2B booking service for Tajikistani salons, barbershops and auto-service businesses, with Telegram receipts and DushanbeCity payment links.

**Architecture:** A single Next.js application owns the web UI, API routes, background jobs and channel webhooks. PostgreSQL is the source of truth; every business-owned record contains `businessId`, booking allocation is transactional, and channel/payment code is isolated behind adapters.

**Tech Stack:** Node.js 22.12+, TypeScript 5.4+, Next.js App Router, React, PostgreSQL 16+, Prisma ORM, Zod, Auth.js, Vitest, Playwright, GramIO or grammY, S3-compatible object storage, pg-boss.

## Global Constraints

- Use strict TypeScript; do not use `any`.
- Use Node.js 22.12+ because Prisma’s current support floor requires it; Next.js requires Node.js 20.9+ at minimum. [Prisma requirements](https://www.prisma.io/docs/orm/reference/system-requirements), [Next.js requirements](https://nextjs.org/docs/app/getting-started/installation)
- Store timestamps in UTC; render all business schedules in `Asia/Dushanbe`.
- Support Russian and Tajik from the first UI route; do not hardcode user-facing copy outside translation files.
- Use TJS amounts as integer dirams (`amountDiram`); 1 TJS is 100 dirams.
- Never log bot tokens, webhook secrets, full card numbers, phone numbers or receipt images.
- Use an explicit `businessId` filter on every tenant-owned read and write.
- Do not fork Cal.diy. Preserve MIT attribution if any source code is copied from it.
- The payment receipt confirms a booking immediately but is not presented as bank-verified settlement.

---

## Planned File Structure

```text
src/
  app/
    (dashboard)/dashboard/...             authenticated business UI
    b/[businessSlug]/page.tsx              public booking flow
    api/bookings/route.ts                  public booking command
    api/payments/[paymentId]/receipt/route.ts
    api/webhooks/telegram/route.ts
    api/webhooks/whatsapp/route.ts
  core/
    auth/
    bookings/
    availability/
    payments/
    tenants/
    notifications/
  integrations/
    dushanbe-city/
    telegram/
    whatsapp/
  jobs/
  i18n/
prisma/schema.prisma
tests/unit/...                             pure domain tests
tests/integration/...                      database and route tests
tests/e2e/...                              browser paths
```

## Task 1: Bootstrap the application and executable local environment

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `docker-compose.yml`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/i18n/ru.json`, `src/i18n/tg.json`
- Create: `tests/unit/i18n/translation.test.ts`

**Interfaces:**
- Produces: `t(locale: SupportedLocale, key: TranslationKey): string` from `src/i18n/translate.ts`.
- Produces: local PostgreSQL, MinIO and Mailpit containers with no production credentials.

- [x] **Step 1: Write the failing translation test.**

```ts
import { t } from "@/i18n/translate";

it("has Russian and Tajik copy for booking confirmation", () => {
  expect(t("ru", "booking.confirmed")).not.toEqual("booking.confirmed");
  expect(t("tg", "booking.confirmed")).not.toEqual("booking.confirmed");
});
```

- [x] **Step 2: Run the test to verify it fails.**

Run: `pnpm vitest run tests/unit/i18n/translation.test.ts`

Expected: failure because the translation module does not exist.

- [x] **Step 3: Create the Next.js TypeScript application and local dependencies.**

Install Next.js, React, Prisma, PostgreSQL driver, Zod, Auth.js, Vitest, Playwright, pg-boss, the Telegram library, and the S3 client. Define scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `test:integration`, and `test:e2e`. Configure Docker Compose service names `postgres`, `minio`, and `mailpit`; `.env.example` contains only variable names and safe local defaults.

- [x] **Step 4: Implement the translation boundary.**

```ts
export const supportedLocales = ["ru", "tg"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export function t(locale: SupportedLocale, key: TranslationKey): string {
  return dictionaries[locale][key] ?? dictionaries.ru[key] ?? key;
}
```

- [x] **Step 5: Run verification.**

Run: `pnpm lint && pnpm typecheck && pnpm vitest run tests/unit/i18n/translation.test.ts`

Expected: all commands pass.

- [x] **Step 6: Commit.**

```bash
git add package.json pnpm-lock.yaml next.config.ts tsconfig.json vitest.config.ts playwright.config.ts \
  docker-compose.yml .env.example src tests
git commit -m "chore: bootstrap ManClient application"
```

## Task 2: Create the tenant, identity and business configuration model

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`
- Create: `src/core/tenants/tenant-context.ts`, `src/core/tenants/tenant-repository.ts`
- Create: `src/core/auth/authorization.ts`
- Test: `tests/integration/tenants/tenant-isolation.test.ts`, `tests/unit/auth/authorization.test.ts`

**Interfaces:**
- Consumes: `SupportedLocale` from Task 1.
- Produces: `requireBusinessMembership(userId: string, businessId: string): Promise<Membership>`.
- Produces: Prisma models `Business`, `Branch`, `Membership`, `StaffMember`, `Service`, `Resource`, `BusinessScheduleRule`.

- [x] **Step 1: Write failing isolation and role tests.**

```ts
it("never returns another business branch", async () => {
  await createBranch({ businessId: businessA.id, name: "A" });
  await expect(listBranches(businessB.id)).resolves.toEqual([]);
});

it("does not let a staff member edit a branch", () => {
  expect(can("STAFF", "branch:update")).toBe(false);
});
```

- [x] **Step 2: Run tests to verify they fail.**

Run: `pnpm vitest run tests/unit/auth/authorization.test.ts tests/integration/tenants/tenant-isolation.test.ts`

Expected: failure because the models and functions do not exist.

- [x] **Step 3: Define the schema and repository boundary.**

Use `BusinessRole = OWNER | ADMIN | STAFF`. Add unique `Business.slug`, `Branch.slug` scoped to a business, and foreign keys from all tenant records to `Business`. Store the DushanbeCity card encrypted and expose only `maskedRecipientCard` outside the payment module.

```ts
export async function listBranches(businessId: string): Promise<Branch[]> {
  return prisma.branch.findMany({ where: { businessId }, orderBy: { name: "asc" } });
}
```

- [x] **Step 4: Add the first migration and seed two isolated businesses.**

Run: `pnpm prisma migrate dev --name tenant-foundation && pnpm prisma db seed`

- [x] **Step 5: Run verification.**

Run: `pnpm test -- tests/unit/auth/authorization.test.ts tests/integration/tenants/tenant-isolation.test.ts && pnpm prisma validate`

Expected: all assertions pass and Prisma validates the schema.

- [x] **Step 6: Commit.**

```bash
git add prisma src/core/tenants src/core/auth tests/unit/auth tests/integration/tenants
git commit -m "feat: add tenant and business configuration model"
```

## Task 3: Build the availability engine and resource-safe allocation

**Files:**
- Create: `src/core/availability/time-range.ts`, `src/core/availability/availability-service.ts`
- Create: `src/core/bookings/booking-allocation.ts`, `src/core/bookings/booking-types.ts`
- Test: `tests/unit/availability/time-range.test.ts`, `tests/integration/bookings/allocation.test.ts`

**Interfaces:**
- Consumes: `Service.durationMinutes`, assigned `StaffMember`, required `Resource[]`, and `BusinessScheduleRule`.
- Produces: `getAvailableStarts(input: AvailabilityQuery): Promise<Date[]>`.
- Produces: `reserveAllocation(input: ReserveAllocationInput): Promise<ReservedAllocation>`.

- [x] **Step 1: Write failing overlap tests.**

```ts
it("rejects an overlapping booking for the same lift", async () => {
  await reserveAllocation({ staffId, resourceIds: [liftId], startsAt: at10, durationMinutes: 60 });
  await expect(reserveAllocation({ staffId: otherStaffId, resourceIds: [liftId], startsAt: at1030, durationMinutes: 60 }))
    .rejects.toMatchObject({ code: "RESOURCE_UNAVAILABLE" });
});
```

- [x] **Step 2: Run the test to verify it fails.**

Run: `pnpm vitest run tests/integration/bookings/allocation.test.ts`

Expected: failure because allocation does not exist.

- [x] **Step 3: Implement UTC interval allocation in a serializable transaction.**

Use half-open intervals `[startsAt, endsAt)`. In the transaction, query confirmed and pending-payment allocations for overlapping staff and resource assignments, then insert the reservation only when all are free.

```ts
const overlaps = existing.startsAt < requestedEndsAt && existing.endsAt > requestedStartsAt;
if (overlaps) throw new BookingConflictError("RESOURCE_UNAVAILABLE");
```

- [x] **Step 4: Add tests for a barber service without resources, two different lifts, a closed schedule, and DST-independent UTC storage.**

Run: `pnpm vitest run tests/unit/availability/time-range.test.ts tests/integration/bookings/allocation.test.ts`

- [x] **Step 5: Commit.**

```bash
git add prisma src/core/availability src/core/bookings tests/unit/availability tests/integration/bookings
git commit -m "feat: add resource-safe booking availability"
```

## Task 4: Implement bookings, reservation expiry and the public API

**Files:**
- Create: `src/core/bookings/booking-service.ts`, `src/core/bookings/booking-repository.ts`
- Create: `src/app/api/bookings/route.ts`, `src/jobs/expire-pending-bookings.ts`
- Test: `tests/integration/bookings/create-booking.test.ts`, `tests/integration/jobs/expire-pending-bookings.test.ts`

**Interfaces:**
- Consumes: `CreateBookingInput { businessSlug, branchId, serviceId, staffId, resourceIds, startsAt, customer }`.
- Produces: `createPendingBooking(input): Promise<{ bookingId: string; paymentId: string; expiresAt: Date }>`.
- Produces: `expirePendingBookings(now: Date): Promise<number>`.

- [x] **Step 1: Write failing API tests.**

```ts
it("creates a 15-minute pending-payment booking", async () => {
  const response = await postBooking(validInput);
  expect(response.status).toBe(201);
  expect(response.body.expiresAt).toEqual(addMinutes(now, 15).toISOString());
});
```

- [x] **Step 2: Run the test to verify it fails.**

Run: `pnpm vitest run tests/integration/bookings/create-booking.test.ts`

- [x] **Step 3: Implement validation, booking state and expiry job.**

Use `BookingStatus = PENDING_PAYMENT | CONFIRMED | CANCELLED | EXPIRED`. Validate all IDs belong to the requested business and branch. Schedule expiry through pg-boss at creation and make expiry idempotent.

- [x] **Step 4: Add failure tests.**

Cover invalid `+992` phone input, a service assigned to another branch, an expired payment reservation, and a double request for the same slot.

- [x] **Step 5: Run verification.**

Run: `pnpm test -- tests/integration/bookings/create-booking.test.ts tests/integration/jobs/expire-pending-bookings.test.ts`

- [x] **Step 6: Commit.**

```bash
git add prisma src/core/bookings src/app/api/bookings src/jobs tests/integration/bookings tests/integration/jobs
git commit -m "feat: add pending booking lifecycle"
```

## Task 5: Add DushanbeCity links, receipt storage and automatic booking confirmation

**Files:**
- Create: `src/integrations/dushanbe-city/payment-link.ts`
- Create: `src/core/payments/payment-service.ts`, `src/core/payments/receipt-recognizer.ts`, `src/core/payments/receipt-storage.ts`
- Create: `src/app/api/payments/[paymentId]/receipt/route.ts`
- Test: `tests/unit/integrations/dushanbe-city/payment-link.test.ts`, `tests/integration/payments/receipt-confirmation.test.ts`

**Interfaces:**
- Produces: `createPaymentUrl(input: { cardNumber: string; amountDiram: number; bookingReference: string }): URL`.
- Produces: `confirmFromReceipt(input: ReceiptInput): Promise<ConfirmedPayment>`.
- `ReceiptInput` includes image storage key, operation number, amount, recipient card suffix, operation time and success flag.

- [x] **Step 1: Write failing link and duplicate-operation tests.**

```ts
it("encodes the DushanbeCity amount in TJS", () => {
  expect(createPaymentUrl({ cardNumber: "1111222233334444", amountDiram: 1750, bookingReference: "MC-1" }).toString())
    .toContain("s=17.50");
});

it("does not accept an operation number twice", async () => {
  await confirmFromReceipt(receiptFor(paymentA));
  await expect(confirmFromReceipt(receiptFor(paymentB))).rejects.toMatchObject({ code: "DUPLICATE_OPERATION" });
});
```

- [x] **Step 2: Run the tests to verify they fail.**

Run: `pnpm vitest run tests/unit/integrations/dushanbe-city/payment-link.test.ts tests/integration/payments/receipt-confirmation.test.ts`

- [x] **Step 3: Implement payment creation and confirmation.**

Generate `A`, `s`, `c`, and `f1=133` with `URLSearchParams`. Store card numbers encrypted. Persist receipt metadata and an object-storage key, not a public file URL. On accepted receipt, atomically move both `Payment` and `Booking` to their confirmed states and emit `booking.confirmed`.

- [x] **Step 4: Add recognition and manual-review paths.**

The Telegram adapter first extracts fields through `ReceiptRecognizer`; malformed or incomplete fields create `PaymentStatus.NEEDS_ATTENTION` and notify an administrator. Tests use deterministic recognizer fixtures, not a live OCR provider.

- [x] **Step 5: Run verification.**

Run: `pnpm test -- tests/unit/integrations/dushanbe-city/payment-link.test.ts tests/integration/payments/receipt-confirmation.test.ts`

- [x] **Step 6: Commit.**

```bash
git add prisma src/integrations/dushanbe-city src/core/payments src/app/api/payments tests/unit/integrations tests/integration/payments
git commit -m "feat: confirm bookings from DushanbeCity receipts"
```

## Task 6: Deliver the dashboard and public booking flow

**Files:**
- Create: `src/app/(dashboard)/dashboard/page.tsx`, `src/app/(dashboard)/dashboard/bookings/page.tsx`
- Create: `src/app/(dashboard)/dashboard/settings/{branches,services,staff,resources}/page.tsx`
- Create: `src/app/b/[businessSlug]/page.tsx`, `src/features/public-booking/booking-form.tsx`
- Test: `tests/e2e/public-booking.spec.ts`, `tests/e2e/dashboard-rbac.spec.ts`

**Interfaces:**
- Consumes: Tasks 2–5 domain services through server actions or route handlers.
- Produces: public booking flow ending at a DushanbeCity URL; role-scoped calendar and settings pages.

- [x] **Step 1: Write failing browser tests.**

```ts
test("visitor selects a barber and receives a payment link", async ({ page }) => {
  await page.goto("/b/demo-barber");
  await page.getByRole("button", { name: /Стрижка/ }).click();
  await page.getByRole("button", { name: /Мастер Алишер/ }).click();
  await page.getByRole("button", { name: /Оплатить предоплату/ }).click();
  await expect(page).toHaveURL(/pay\.dc\.tj/);
});
```

- [x] **Step 2: Run the browser test to verify it fails.**

Run: `pnpm playwright test tests/e2e/public-booking.spec.ts`

- [x] **Step 3: Implement responsive public and dashboard surfaces.**

Use server-rendered pages for public data, progressively enhanced form steps for interaction, and the translation boundary from Task 1. Dashboard roles: owner/admin can configure business data; staff can view only their own bookings. Do not expose full recipient card numbers in the UI after setup.

- [x] **Step 4: Add empty, loading, invalid-input and booking-conflict states.**

Test a business without services, a selected slot lost to a competing booking, Tajik language rendering, and staff access to another employee’s calendar.

- [x] **Step 5: Run verification.**

Run: `pnpm test && pnpm playwright test tests/e2e/public-booking.spec.ts tests/e2e/dashboard-rbac.spec.ts`

- [x] **Step 6: Commit.**

```bash
git add src/app src/features tests/e2e
git commit -m "feat: add dashboard and public booking flow"
```

## Task 7: Connect Telegram confirmation, rescheduling and cancellation

**Files:**
- Create: `src/integrations/telegram/telegram-client.ts`, `src/integrations/telegram/update-handler.ts`
- Create: `src/app/api/webhooks/telegram/route.ts`
- Create: `src/core/bookings/reschedule-booking.ts`, `src/core/bookings/cancel-booking.ts`
- Test: `tests/integration/integrations/telegram-webhook.test.ts`, `tests/integration/bookings/reschedule-booking.test.ts`

**Interfaces:**
- Produces: `handleTelegramUpdate(update: TelegramUpdate): Promise<void>`.
- Produces: `rescheduleBooking(input: { bookingId: string; customerId: string; startsAt: Date }): Promise<Booking>`.
- Produces: `cancelBooking(input: { bookingId: string; actor: BookingActor }): Promise<Booking>`.

- [x] **Step 1: Write failing webhook tests.**

```ts
it("confirms the matched pending booking from a receipt message", async () => {
  await handleTelegramUpdate(receiptPhotoUpdate);
  await expect(getBooking(bookingId)).resolves.toMatchObject({ status: "CONFIRMED" });
});

it("rejects a webhook without the configured secret", async () => {
  await expect(postTelegramWebhook({ secret: "wrong" })).resolves.toHaveProperty("status", 401);
});
```

- [x] **Step 2: Run the tests to verify they fail.**

Run: `pnpm vitest run tests/integration/integrations/telegram-webhook.test.ts tests/integration/bookings/reschedule-booking.test.ts`

- [x] **Step 3: Implement the Telegram adapter.**

Verify Telegram’s secret token header before parsing. Map photo uploads to `ReceiptRecognizer`, send booking confirmation after Task 5 confirms the payment, and use callback payloads containing a signed booking action token rather than raw IDs.

- [x] **Step 4: Implement rescheduling and cancellation with fresh allocation.**

Rescheduling releases no existing allocation until the replacement is reserved. Cancellation records actor and time, then makes the former slot available.

- [x] **Step 5: Run verification.**

Run: `pnpm test -- tests/integration/integrations/telegram-webhook.test.ts tests/integration/bookings/reschedule-booking.test.ts`

- [x] **Step 6: Commit.**

```bash
git add src/integrations/telegram src/app/api/webhooks/telegram src/core/bookings tests/integration
git commit -m "feat: add Telegram booking actions"
```

## Task 8: Add notifications, WhatsApp adapter and operational audit trail

**Files:**
- Create: `src/core/notifications/notification-service.ts`, `src/jobs/send-booking-reminder.ts`
- Create: `src/integrations/whatsapp/whatsapp-client.ts`, `src/app/api/webhooks/whatsapp/route.ts`
- Create: `src/core/audit/audit-service.ts`
- Test: `tests/unit/notifications/reminder-scheduling.test.ts`, `tests/integration/integrations/whatsapp-webhook.test.ts`, `tests/integration/audit/audit-log.test.ts`

**Interfaces:**
- Produces: `scheduleBookingReminders(booking: Booking): Promise<void>`.
- Produces: `sendTemplateMessage(input: WhatsAppTemplateMessage): Promise<MessageDelivery>`.
- Produces: `writeAuditEvent(input: AuditEventInput): Promise<void>`.

- [x] **Step 1: Write failing reminder and audit tests.**

```ts
it("schedules one reminder 24 hours before a confirmed booking", async () => {
  await scheduleBookingReminders(confirmedBooking);
  expect(await queuedJobs("booking-reminder")).toHaveLength(1);
});

it("records a receipt confirmation without storing the card number", async () => {
  await confirmFromReceipt(receipt);
  expect((await latestAuditEvent()).metadata).not.toHaveProperty("cardNumber");
});
```

- [x] **Step 2: Run the tests to verify they fail.**

Run: `pnpm vitest run tests/unit/notifications/reminder-scheduling.test.ts tests/integration/audit/audit-log.test.ts`

- [x] **Step 3: Implement durable jobs and delivery adapters.**

Schedule reminders after confirmation. Use Telegram as the first delivery channel. Implement WhatsApp’s official API request and webhook signature verification behind `WhatsAppClient`; only approved template identifiers and parameters leave the application.

- [x] **Step 4: Add fallback and error tests.**

Cover failed Telegram delivery, expired reminder jobs, invalid WhatsApp webhook signature, and an unknown template identifier. Failed deliveries are retried with bounded attempts and recorded in `Message`.

- [x] **Step 5: Run verification.**

Run: `pnpm test -- tests/unit/notifications/reminder-scheduling.test.ts tests/integration/integrations/whatsapp-webhook.test.ts tests/integration/audit/audit-log.test.ts`

- [x] **Step 6: Commit.**

```bash
git add prisma src/core/notifications src/core/audit src/jobs src/integrations/whatsapp src/app/api/webhooks/whatsapp tests
git commit -m "feat: add reminders WhatsApp and audit events"
```

## Task 9: Prove the pilot path and document operation

**Files:**
- Create: `docs/pilot-runbook.md`, `docs/dushanbecity-receipt-handling.md`
- Create: `tests/e2e/pilot-booking-flow.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: all prior components.
- Produces: repeatable first-business setup and an evidence-backed end-to-end pilot check.

- [x] **Step 1: Write the failing end-to-end pilot path.**

```ts
test("pilot business confirms an auto-service booking after Telegram receipt", async ({ page, request }) => {
  const booking = await createPublicAutoServiceBooking(page);
  await deliverReceiptToTelegramWebhook(request, booking.paymentId);
  await expect(page.getByText(/Запись подтверждена/)).toBeVisible();
  await expectDashboardBooking(booking.id).toHaveStatus("CONFIRMED");
});
```

- [x] **Step 2: Run the test to verify it fails before wiring fixtures.**

Run: `pnpm playwright test tests/e2e/pilot-booking-flow.spec.ts`

- [x] **Step 3: Add deterministic pilot fixtures and write the runbooks.**

Seed one barber business and one auto-service business with a lift. Document environment variables by name, webhook registration, card encryption-key rotation, Telegram secret setup, backup/restore, and receipt dispute handling. Do not put real tokens, cards or client data in documentation.

- [x] **Step 4: Run the complete verification suite.**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm playwright test`

Expected: all checks pass; the browser test proves booking, receipt confirmation and dashboard visibility against the running application.

- [x] **Step 5: Commit.**

```bash
git add README.md docs tests/e2e prisma/seed.ts
git commit -m "docs: add ManClient pilot runbook"
```

## Plan Self-Review

### Spec coverage

- Manual onboarding, multi-tenant businesses, roles, branches, services, resources and schedules: Tasks 2 and 6.
- Public booking, a selected staff member, a selected resource, and double-booking prevention: Tasks 3, 4 and 6.
- DushanbeCity link, direct business card, receipt upload, immediate booking confirmation and duplicate operation handling: Task 5.
- Telegram receipt, confirmation, reminder, reschedule and cancel: Tasks 7 and 8.
- WhatsApp notifications only: Task 8.
- TJS, `Asia/Dushanbe`, `+992`, Russian and Tajik: Tasks 1, 4 and 6.
- Audit log, no secret logging, pilot verification and runbook: Tasks 2, 5, 8 and 9.

### Interface consistency

The booking lifecycle uses `PENDING_PAYMENT`, `CONFIRMED`, `CANCELLED`, and `EXPIRED` in Tasks 4–9. Resource allocation is provided by Task 3 and consumed by Tasks 4, 6 and 7. Payment confirmation from Task 5 emits the event consumed by Tasks 7 and 8.

### Scope check

The work is ordered as nine independently verifiable vertical slices. Each slice leaves a working system and avoids adding marketplace, CRM, local payment settlement verification, or self-service onboarding.
