# Client Telegram Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать отдельный Telegram-бот бизнеса полноценным приватным клиентским интерфейсом записи, оплаты, чека, переноса и отмены.

**Architecture:** Один customer bot handler использует durable conversation state и opaque `ConversationAction`; deep link закрепляет точные booking/payment, а единый receipt service обслуживает web и Telegram. Webhook имеет retry-safe inbound lifecycle, а клиентские события доставляются durable notification worker-ом.

**Tech Stack:** Next.js 16 Route Handlers, TypeScript 5.9, Prisma 7/PostgreSQL, Telegram Bot API, Vitest.

## Global Constraints

- Клиентский бот принимает персональные данные только в Telegram private chat.
- `/start <token>` связывает только подписанные business, booking, payment и purpose; обычный `/start` открывает Home.
- Чек всегда относится к `paymentId` активного server-side conversation; выбор последней оплаты по chat ID запрещён.
- Callback содержит только opaque action ID и всегда получает `answerCallbackQuery`.
- Web и Telegram используют один receipt submission service с одинаковой нормализацией, лимитами и audit.
- Перенос и отмена выполняются нативно, tenant/customer-scoped и идемпотентно.
- Locale сохраняется и применяется к меню, ошибкам, датам, статусам и notifications; таджикский не копируется из русского.
- Временный failure после claim допускает retry и не превращает update в потерянный duplicate.

---

### Task 1: Retry-safe webhook, private gate and exact payment deep link

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260729233000_client_telegram_inbound/migration.sql`
- Modify: `src/core/integrations/inbound-update-service.ts`
- Modify: `src/app/api/webhooks/telegram/business/[publicId]/route.ts`
- Modify: `src/integrations/telegram/business-update-dispatcher.ts`
- Modify: `src/integrations/telegram/business-update-handler.ts`
- Modify: `src/core/bookings/booking-action-token.ts`
- Test: `tests/integration/integrations/business-telegram-webhook.test.ts`
- Create: `tests/integration/integrations/telegram-client-security.test.ts`

**Interfaces:**
- Produces: `claimInboundUpdate` returning `CLAIMED | COMPLETED | BUSY`, `completeInboundUpdate`, `failInboundUpdate`.
- Produces: verified `link_payment` payload and exact conversation `{ bookingId, paymentId }`.

- [ ] **Step 1: Write failing private/deep-link/lifecycle tests**

```ts
it("binds a payment deep link exactly once and never accepts PII in groups", async () => {
  await postUpdate(privateUpdate(`/start ${token}`));
  expect(await activeSession()).toMatchObject({ data: { bookingId, paymentId } });
  await postUpdate(groupUpdate("Customer Name"));
  expect(await customerCount()).toBe(0);
});
```

Assert transient handler failure moves update to retryable state and the repeated same `update_id` executes once more; completed updates remain duplicates.

- [ ] **Step 2: Run RED tests**

Run: `pnpm test tests/integration/integrations/business-telegram-webhook.test.ts tests/integration/integrations/telegram-client-security.test.ts`

Expected: FAIL because chat type/from/lifecycle and exact deep-link routing are absent.

- [ ] **Step 3: Implement lifecycle, private gate and deep-link verification**

Use claim attempts and explicit status in PostgreSQL with an atomic conditional update. Validate `chat.type === "private"` before opening a conversation. Verify signed token, tenant and current payment/booking relationship before binding state.

- [ ] **Step 4: Run GREEN and schema generation**

Run: `pnpm db:generate && pnpm test tests/integration/integrations/business-telegram-webhook.test.ts tests/integration/integrations/telegram-client-security.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma src/core/integrations src/core/bookings/booking-action-token.ts src/app/api/webhooks/telegram/business src/integrations/telegram tests/integration/integrations
git commit -m "fix: secure client Telegram entry flow"
```

### Task 2: Home, commands, navigation and persisted locale

**Files:**
- Modify: `prisma/schema.prisma`
- Create migration only if Task 1 did not include locale persistence.
- Modify: `src/core/conversations/conversation-state.ts`
- Modify: `src/core/conversations/conversation-engine.ts`
- Modify: `src/core/conversations/messages.ru.ts`
- Modify: `src/core/conversations/messages.tg.ts`
- Modify: `src/integrations/telegram/conversation-renderer.ts`
- Modify: `src/integrations/telegram/business-update-handler.ts`
- Test: `tests/unit/conversations/conversation-engine.test.ts`
- Create: `tests/integration/integrations/telegram-client-flow.test.ts`

**Interfaces:**
- Produces states `HOME`, existing booking wizard states, `BOOKING_LIST`, `BOOKING_CARD`, `RESCHEDULE_DATE`, `RESCHEDULE_SLOT`, `CANCEL_CONFIRM`, `AWAITING_RECEIPT`.
- Produces commands `/start`, `/book`, `/bookings`, `/language`, `/help` and actions `BACK`, `HOME`, pagination actions.

- [ ] **Step 1: Write failing navigation and locale tests**

Assert Home actions, Back at every wizard boundary, Home recovery after expiry, page sizes branch/service/staff 8 and slots 12, empty state recovery and locale persistence across `/start`.

- [ ] **Step 2: Run RED tests**

Run: `pnpm test tests/unit/conversations/conversation-engine.test.ts tests/integration/integrations/telegram-client-flow.test.ts`

Expected: FAIL on missing Home/navigation/locale behavior.

- [ ] **Step 3: Implement state transitions, renderer and complete RU/TG copy**

Keep action payload opaque in Telegram. Store page/filter/state only server-side. Use whole localized phrases and locale-specific `Intl.DateTimeFormat`; do not assemble Russian fragments into Tajik messages.

- [ ] **Step 4: Run GREEN tests**

Run: `pnpm test tests/unit/conversations/conversation-engine.test.ts tests/integration/integrations/telegram-client-flow.test.ts tests/integration/conversations`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma src/core/conversations src/integrations/telegram tests/unit/conversations tests/integration/integrations/telegram-client-flow.test.ts tests/integration/conversations
git commit -m "feat: add client bot home and navigation"
```

### Task 3: Customer-scoped booking list and native cards

**Files:**
- Create: `src/core/bookings/customer-booking-query-service.ts`
- Modify: `src/integrations/telegram/business-update-handler.ts`
- Modify: `src/integrations/telegram/conversation-renderer.ts`
- Create: `tests/integration/bookings/customer-booking-query.test.ts`
- Modify: `tests/integration/integrations/telegram-client-flow.test.ts`

**Interfaces:**
- Produces: `listCustomerBookings({ businessId, telegramChatId, cursor, limit })`.
- Produces: `getCustomerBooking({ businessId, telegramChatId, bookingId })`.

- [ ] **Step 1: Write failing scope/pagination/card tests**

Create customers with the same Telegram chat in two tenants and several bookings. Assert only current business/customer appears, limit is 6, cursor has no duplication, statuses/actions are current and dates use branch timezone.

- [ ] **Step 2: Run RED tests**

Run: `pnpm test tests/integration/bookings/customer-booking-query.test.ts tests/integration/integrations/telegram-client-flow.test.ts`

Expected: FAIL because customer query service and cards do not exist.

- [ ] **Step 3: Implement query service and cards**

Load customer through `(businessId, telegramChatId)`, never global chat ID. Show Pay/Receipt only for eligible payment states, Reschedule/Cancel only for active future bookings, and safe contact details only from current branch.

- [ ] **Step 4: Run GREEN tests**

Run: `pnpm test tests/integration/bookings/customer-booking-query.test.ts tests/integration/integrations/telegram-client-flow.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/bookings/customer-booking-query-service.ts src/integrations/telegram tests/integration/bookings/customer-booking-query.test.ts tests/integration/integrations/telegram-client-flow.test.ts
git commit -m "feat: show customer bookings in Telegram"
```

### Task 4: Unified exact-payment receipt flow

**Files:**
- Modify: `src/core/payments/receipt-submission-service.ts`
- Modify: `src/integrations/telegram/update-handler.ts`
- Modify: `src/integrations/telegram/business-update-handler.ts`
- Modify: `src/integrations/telegram/business-update-dispatcher.ts`
- Test: `tests/unit/payments/receipt-submission.test.ts`
- Test: `tests/integration/payments/receipt-confirmation.test.ts`
- Modify: `tests/integration/integrations/telegram-client-flow.test.ts`

**Interfaces:**
- Produces: `submitReceiptImage({ businessId, paymentId, actor, bytes, contentType }, dependencies)` shared by web and Telegram.

- [ ] **Step 1: Write failing exact-payment and validation tests**

Assert two pending payments for one customer: selected `paymentId` alone changes. Cover supported image, oversize/invalid format, accepted OCR, needs review, duplicate operation, storage failure and photo without selected payment.

- [ ] **Step 2: Run RED tests**

Run: `pnpm test tests/unit/payments/receipt-submission.test.ts tests/integration/payments/receipt-confirmation.test.ts tests/integration/integrations/telegram-client-flow.test.ts`

Expected: FAIL because Telegram bypasses common submission and selects latest payment by chat.

- [ ] **Step 3: Implement one receipt service and remove duplicate selection**

Normalize/validate once, pass exact scoped payment, preserve durable submission/audit and make the old Telegram update handler a thin adapter or delete its superseded branch. Send immediate receipt feedback before OCR/storage work.

- [ ] **Step 4: Run GREEN tests**

Run: `pnpm test tests/unit/payments/receipt-submission.test.ts tests/integration/payments/receipt-confirmation.test.ts tests/integration/integrations/telegram-client-flow.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/payments src/integrations/telegram tests/unit/payments tests/integration/payments tests/integration/integrations/telegram-client-flow.test.ts
git commit -m "fix: bind Telegram receipts to exact payment"
```

### Task 5: Native reschedule and cancellation

**Files:**
- Modify: `src/core/bookings/booking-action-token.ts`
- Modify: `src/core/conversations/conversation-state.ts`
- Modify: `src/core/conversations/conversation-engine.ts`
- Modify: `src/integrations/telegram/business-update-handler.ts`
- Create: `tests/integration/integrations/telegram-client-booking-actions.test.ts`

**Interfaces:**
- Consumes existing customer cancellation/reschedule domain services.
- Produces actions `RESCHEDULE_BEGIN`, `RESCHEDULE_DATE`, `RESCHEDULE_SLOT`, `RESCHEDULE_CONFIRM`, `CANCEL_BEGIN`, `CANCEL_CONFIRM`.

- [ ] **Step 1: Write failing action tests**

Assert explicit cancel confirm, repeated cancel current-state response, available slot selection, allocation recheck, old slot preserved on conflict, successful atomic reschedule, expired action recovery and foreign-customer denial.

- [ ] **Step 2: Run RED test**

Run: `pnpm test tests/integration/integrations/telegram-client-booking-actions.test.ts`

Expected: FAIL because Telegram currently redirects reschedule to web and cancellation is incomplete.

- [ ] **Step 3: Implement native flows**

Use server-side actions and existing domain operations. Answer callback before work, edit the card after success, remove mutation buttons and show a concrete alternative when a slot is lost.

- [ ] **Step 4: Run GREEN and booking regressions**

Run: `pnpm test tests/integration/integrations/telegram-client-booking-actions.test.ts tests/integration/bookings`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/bookings src/core/conversations src/integrations/telegram/business-update-handler.ts tests/integration/integrations/telegram-client-booking-actions.test.ts tests/integration/bookings
git commit -m "feat: manage client bookings in Telegram"
```

### Task 6: Durable client notifications, commands and final verification

**Files:**
- Create or extend: `src/core/notifications/customer-telegram-notification-service.ts`
- Modify: `src/core/payments/payment-review-service.ts`
- Modify: `src/core/notifications/notification-service.ts`
- Modify: `src/jobs/send-booking-reminder.ts`
- Modify: `src/core/integrations/business-telegram-service.ts`
- Modify: `src/integrations/telegram/telegram-api.ts`
- Modify: `docs/pilot-runbook.md`
- Create: `tests/integration/notifications/customer-telegram-notification.test.ts`
- Modify: `tests/integration/jobs/send-booking-reminder.test.ts`
- Modify: `tests/unit/integrations/telegram-api.test.ts`

**Interfaces:**
- Produces durable customer events for receipt accepted/review/rejected, reschedule, cancel and reminder.
- Produces business-bot setup registration of `/start`, `/book`, `/bookings`, `/language`, `/help`.

- [ ] **Step 1: Write failing notification/command/locale tests**

Assert automatic acceptance, needs-review, manual approve/reject with safe reason, retry after Telegram failure, locale-specific reminder and `setMyCommands` when a tenant bot connects.

- [ ] **Step 2: Run RED tests**

Run: `pnpm test tests/integration/notifications/customer-telegram-notification.test.ts tests/integration/jobs/send-booking-reminder.test.ts tests/unit/integrations/telegram-api.test.ts`

Expected: FAIL on missing durable decisions, locale and command registration.

- [ ] **Step 3: Implement notifications and command registration**

Schedule after commit with deterministic deduplication keys. Render fresh booking/payment data at delivery. Keep safe rejection reason and direct retry action; never include storage key or full card.

- [ ] **Step 4: Run complete verification**

Run:

```bash
pnpm test tests/unit/conversations tests/unit/payments tests/unit/integrations
pnpm test tests/integration/integrations tests/integration/bookings tests/integration/payments tests/integration/notifications tests/integration/jobs
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: all commands exit 0 without new warnings.

- [ ] **Step 5: Audit design-spec coverage**

Record direct test/code evidence for exact deep link, two-payment receipt isolation, private gate, navigation/pagination, callback answer/edit, manual review notifications, native booking actions, locale parity, retry lifecycle and tenant isolation.

- [ ] **Step 6: Commit**

```bash
git add src/core/notifications src/core/payments/payment-review-service.ts src/jobs src/core/integrations/business-telegram-service.ts src/integrations/telegram/telegram-api.ts docs/pilot-runbook.md tests
git commit -m "feat: complete client Telegram experience"
```
