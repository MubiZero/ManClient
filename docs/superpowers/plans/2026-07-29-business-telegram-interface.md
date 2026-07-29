# Business Telegram Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить `@manclient_bot` в безопасный самостоятельный рабочий интерфейс владельца и команды для записей, чеков и оперативных уведомлений.

**Architecture:** Platform bot получает единый update dispatcher, отделённые identity/query/action/rendering services и непрозрачные callback actions. Все мутации делегируются существующим booking/payment services, а доставка событий бизнеса идёт через durable message outbox и отдельный job.

**Tech Stack:** Next.js 16 Route Handlers, TypeScript 5.9, Prisma 7/PostgreSQL, Telegram Bot API, Vitest, pg-boss-compatible scheduled jobs.

## Global Constraints

- Клиенты не записываются через `@manclient_bot`; клиентский flow остаётся в отдельном боте бизнеса.
- Новая запись видна бизнесу сразу, включая `PENDING_PAYMENT`.
- OWNER/ADMIN видят все записи и чеки; STAFF — только запись привязанного `StaffMember`.
- Групповой `chat.id` не даёт полномочий: мутации авторизуются по `from.id` связанного Telegram identity.
- Callback не содержит business, membership, booking, payment или персональные ID; используется непрозрачный action token.
- Любая доменная мутация выполняется существующим booking/payment service и аудируется.
- Telegram failure не откатывает запись или платёж; доставка повторяется через outbox.
- Полные номера карт, bot tokens, internal errors и stack traces не попадают в UI, callback, логи или audit metadata.
- Русские тексты полные; таджикский не подделывается копированием русского.

---

### Task 1: Telegram identity, destinations and secure linking

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260729213000_business_telegram_identity/migration.sql`
- Modify: `src/core/integrations/platform-chat-link.ts`
- Modify: `src/integrations/telegram/platform-update-handler.ts`
- Test: `tests/integration/integrations/platform-telegram-webhook.test.ts`
- Test: `tests/integration/integrations/telegram-schema.test.ts`

**Interfaces:**
- Produces: `consumePlatformChatLink(token, { chatId, chatType, telegramUserId }, now)`.
- Produces: `getPlatformTelegramActor({ chatId, telegramUserId })` returning active membership, business, role and destination.
- Produces: `listBusinessTelegramDestinations(businessId)` for notification delivery.

- [ ] **Step 1: Write failing identity and group authorization tests**

```ts
it("authorizes a group callback only for a linked Telegram identity", async () => {
  await consumePlatformChatLink(token, {
    chatId: "-10042",
    chatType: "supergroup",
    telegramUserId: "7001",
  }, now);
  await expect(getPlatformTelegramActor({ chatId: "-10042", telegramUserId: "7001" }))
    .resolves.toMatchObject({ membershipId, businessId, role: "OWNER" });
  await expect(getPlatformTelegramActor({ chatId: "-10042", telegramUserId: "7002" }))
    .resolves.toBeNull();
});
```

- [ ] **Step 2: Run RED tests**

Run: `pnpm test tests/integration/integrations/platform-telegram-webhook.test.ts tests/integration/integrations/telegram-schema.test.ts`

Expected: FAIL because identity/chat type fields and actor lookup do not exist.

- [ ] **Step 3: Add normalized identity and destination fields**

Model a unique `(membershipId, telegramUserId)` identity and active chat destination with `chatType`, preserving current private links through a migration. Parse `message.from.id`, `callback_query.from.id` and `chat.type`. A group deep link may create the destination for the linking admin, but callbacks always resolve the individual actor.

- [ ] **Step 4: Implement safe link consumption and actor lookup**

Keep HMAC signature, expiry, single consumption and transaction isolation. Reject STAFF creation of a shared destination; allow STAFF private identity connection. Return generic expired/invalid copy without revealing membership data.

- [ ] **Step 5: Run GREEN tests and schema generation**

Run: `pnpm db:generate && pnpm test tests/integration/integrations/platform-telegram-webhook.test.ts tests/integration/integrations/telegram-schema.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma src/core/integrations/platform-chat-link.ts src/integrations/telegram/platform-update-handler.ts tests/integration/integrations/platform-telegram-webhook.test.ts tests/integration/integrations/telegram-schema.test.ts
git commit -m "feat: secure business Telegram identities"
```

### Task 2: Telegram adapter and native interaction primitives

**Files:**
- Modify: `src/integrations/telegram/telegram-api.ts`
- Create: `src/integrations/telegram/business-bot-renderer.ts`
- Test: `tests/unit/integrations/telegram-api.test.ts`
- Create: `tests/unit/integrations/business-bot-renderer.test.ts`

**Interfaces:**
- Produces: `TelegramMessageRef = { chatId: string; messageId: number }`.
- Produces adapter methods `answerCallbackQuery`, `editMessageText`, `editMessageReplyMarkup`, `sendPhoto`, `setMyCommands`.
- Produces renderer functions `mainMenuView`, `bookingListView`, `bookingCardView`, `paymentReviewView`, `staleActionView`.

- [ ] **Step 1: Write failing adapter contract tests**

```ts
it("answers callbacks without leaking tokens", async () => {
  const calls: Array<{ method: string; body: unknown }> = [];
  const api = createTelegramApi("123:secret", recordingFetcher(calls));
  await api.answerCallbackQuery("callback-1", "Готово");
  expect(calls).toContainEqual({
    method: "answerCallbackQuery",
    body: { callback_query_id: "callback-1", text: "Готово" },
  });
});
```

- [ ] **Step 2: Write failing renderer tests**

Assert that menus are role-aware, booking cards contain useful local date/payment status, rows contain at most two buttons, destructive actions use confirmation copy, and no internal IDs/card numbers appear.

- [ ] **Step 3: Run RED tests**

Run: `pnpm test tests/unit/integrations/telegram-api.test.ts tests/unit/integrations/business-bot-renderer.test.ts`

Expected: FAIL on missing adapter and renderer exports.

- [ ] **Step 4: Implement adapter and renderer**

Use Telegram-native reply/inline keyboard types. `sendPhoto` accepts stored bytes or a signed protected URL supplied by the caller; renderer consumes typed view models and performs no Prisma access.

- [ ] **Step 5: Run GREEN tests**

Run: `pnpm test tests/unit/integrations/telegram-api.test.ts tests/unit/integrations/business-bot-renderer.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/integrations/telegram/telegram-api.ts src/integrations/telegram/business-bot-renderer.ts tests/unit/integrations
git commit -m "feat: add native business bot rendering"
```

### Task 3: Role-scoped dashboard, booking lists and cards

**Files:**
- Create: `src/core/integrations/business-bot-query-service.ts`
- Create: `src/core/integrations/business-bot-actions.ts`
- Create: `src/integrations/telegram/business-bot-handler.ts`
- Modify: `src/integrations/telegram/platform-update-handler.ts`
- Modify: `src/app/api/webhooks/telegram/platform/route.ts`
- Create: `tests/integration/integrations/business-bot-query.test.ts`
- Create: `tests/integration/integrations/business-bot-handler.test.ts`

**Interfaces:**
- Consumes: actor from Task 1 and renderer from Task 2.
- Produces: `getBusinessBotSummary(actor, now)`, `listBusinessBotBookings(actor, filter, cursor, now)`, `getBusinessBotBooking(actor, bookingId)`.
- Produces: opaque action functions `createBusinessBotAction` and `consumeBusinessBotAction` with actor, business, expiry and one-shot mutation policy.

- [ ] **Step 1: Write failing role and time-zone query tests**

Create OWNER and STAFF fixtures in the same business plus another tenant. Assert OWNER sees all in-scope bookings, STAFF sees only its staff assignment, other-tenant data never appears, `today` uses branch timezone, and cursor pagination has no duplicates.

- [ ] **Step 2: Write failing handler flow tests**

```ts
it("renders a useful menu and opens a pending booking without a web redirect", async () => {
  await handleBusinessBotUpdate(linkedOwnerContext, startUpdate, dependencies);
  expect(sent.at(-1)?.text).toContain("Ожидают оплату");
  await handleBusinessBotUpdate(linkedOwnerContext, callback("bookings:pending"), dependencies);
  expect(sent.at(-1)?.text).toContain("Ожидает оплату");
  expect(sent.at(-1)?.text).not.toContain("/dashboard");
});
```

- [ ] **Step 3: Run RED tests**

Run: `pnpm test tests/integration/integrations/business-bot-query.test.ts tests/integration/integrations/business-bot-handler.test.ts`

Expected: FAIL because query/action/handler modules do not exist.

- [ ] **Step 4: Implement query and opaque action services**

Reuse `requireBookingAccess`, `bookingScopeWhere`, shared date/money/phone formatters and `ConversationAction` only if its semantics remain clear; otherwise add a focused `BusinessTelegramAction` model and migration. Navigation actions may be repeatable; mutation actions are consumed once.

- [ ] **Step 5: Implement `/start`, `/menu`, `/help`, reply menu and callbacks**

Include summary, Today, Bookings filters, Client link, More, role-gated Checks and channel status. Answer every callback immediately, edit prior cards when possible, and provide `Обновить`/`Главное меню` for stale actions.

- [ ] **Step 6: Run GREEN tests**

Run: `pnpm test tests/integration/integrations/business-bot-query.test.ts tests/integration/integrations/business-bot-handler.test.ts tests/integration/integrations/platform-telegram-webhook.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/integrations src/integrations/telegram src/app/api/webhooks/telegram/platform tests/integration/integrations
git commit -m "feat: add business bot booking workspace"
```

### Task 4: Booking mutations from Telegram

**Files:**
- Modify: `src/integrations/telegram/business-bot-handler.ts`
- Modify: `src/core/integrations/business-bot-actions.ts`
- Modify: `src/core/booking-operations/booking-command-service.ts`
- Create: `tests/integration/integrations/business-bot-booking-actions.test.ts`

**Interfaces:**
- Consumes: `confirmBusinessBooking`, `rescheduleBusinessBooking`, `cancelBusinessBooking`.
- Produces: action kinds `BOOKING_CONFIRM`, `BOOKING_REMIND_PAYMENT`, `BOOKING_RESCHEDULE_DATE`, `BOOKING_RESCHEDULE_SLOT`, `BOOKING_CANCEL_BEGIN`, `BOOKING_CANCEL_REASON`, `BOOKING_REFRESH`.

- [ ] **Step 1: Write failing mutation authorization/idempotency tests**

Assert OWNER confirmation, STAFF scope denial, foreign tenant denial, repeated confirmation showing current state, cancellation confirmation with reason, and reschedule rechecking allocation before changing the old slot.

- [ ] **Step 2: Write failing payment reminder test**

Assert that reminder creation is deduplicated by booking/channel/kind and that it targets the linked customer channel without marking payment complete.

- [ ] **Step 3: Run RED tests**

Run: `pnpm test tests/integration/integrations/business-bot-booking-actions.test.ts`

Expected: FAIL because bot mutation handlers and payment reminder scheduling are missing.

- [ ] **Step 4: Implement confirmation, reminder, reschedule and cancellation flows**

All writes call domain services with `actorUserId`; translate `BookingOperationError` into specific recovery copy. Store multi-step cancellation/reschedule state as short-lived server actions, not global in-memory state.

- [ ] **Step 5: Run GREEN and regression tests**

Run: `pnpm test tests/integration/integrations/business-bot-booking-actions.test.ts tests/integration/booking-operations`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core src/integrations/telegram/business-bot-handler.ts tests/integration/integrations/business-bot-booking-actions.test.ts
git commit -m "feat: manage bookings from business bot"
```

### Task 5: Payment review queue and receipt image

**Files:**
- Modify: `src/core/payments/payment-review-service.ts`
- Modify: `src/core/payments/receipt-storage.ts`
- Modify: `src/core/integrations/business-bot-query-service.ts`
- Modify: `src/integrations/telegram/business-bot-handler.ts`
- Create: `tests/integration/integrations/business-bot-payment-review.test.ts`

**Interfaces:**
- Consumes: `listPaymentsForReview`, `getPaymentForReview`, `approvePaymentReview`, `rejectPaymentReview`.
- Produces: paginated review query and protected receipt bytes/short-lived URL accessor.

- [ ] **Step 1: Write failing review queue tests**

Assert OWNER/ADMIN access, STAFF denial, pagination, safe card mask, receipt photo delivery, typical rejection reasons, custom reason validation, duplicate decision idempotency and customer notification scheduling.

- [ ] **Step 2: Run RED test**

Run: `pnpm test tests/integration/integrations/business-bot-payment-review.test.ts`

Expected: FAIL because bot review flow and protected image accessor are missing.

- [ ] **Step 3: Implement queue, image and decision flows**

Never expose raw storage keys publicly. Use `sendPhoto` with protected data, immediately answer callbacks, require confirmation before approval, and refresh the card after a decision.

- [ ] **Step 4: Run GREEN and payment regression tests**

Run: `pnpm test tests/integration/integrations/business-bot-payment-review.test.ts tests/integration/payments`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/payments src/core/integrations/business-bot-query-service.ts src/integrations/telegram/business-bot-handler.ts tests/integration/integrations/business-bot-payment-review.test.ts
git commit -m "feat: review receipts from business bot"
```

### Task 6: Durable business notifications

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260729223000_business_notification_outbox/migration.sql`
- Create: `src/core/notifications/business-notification-service.ts`
- Create: `src/jobs/send-business-telegram-notifications.ts`
- Create: `src/jobs/run-business-notifications.ts`
- Modify: `package.json`
- Add calls after successful booking/payment/receipt operations in the owning domain services.
- Create: `tests/integration/notifications/business-notification-service.test.ts`
- Create: `tests/integration/jobs/send-business-telegram-notifications.test.ts`

**Interfaces:**
- Produces: `scheduleBusinessNotification({ businessId, bookingId?, kind, deduplicationKey, scheduledAt })`.
- Produces: `sendDueBusinessTelegramNotifications(now, dependencies)` with claim, retry and terminal failure handling.

- [ ] **Step 1: Write failing scheduling and retry tests**

Assert event deduplication, delivery to all active destinations, role-sensitive receipt notifications, no rollback of domain operation, retry after five minutes and terminal `FAILED` after `maxAttempts`.

- [ ] **Step 2: Run RED tests**

Run: `pnpm test tests/integration/notifications/business-notification-service.test.ts tests/integration/jobs/send-business-telegram-notifications.test.ts`

Expected: FAIL because outbox and worker do not exist.

- [ ] **Step 3: Implement outbox and job**

Persist typed event payload references, not rendered PII snapshots. Load fresh authorized view data at delivery time. Reuse platform bot token only at runtime. Record a generic safe `lastError` and do not log secrets.

- [ ] **Step 4: Wire domain events**

Schedule new pending booking, receipt processing/review, payment decision, confirmation, cancellation, reschedule and upcoming visit events only after the relevant transaction commits. Use deterministic deduplication keys.

- [ ] **Step 5: Run GREEN tests and schema generation**

Run: `pnpm db:generate && pnpm test tests/integration/notifications/business-notification-service.test.ts tests/integration/jobs/send-business-telegram-notifications.test.ts tests/integration/jobs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma src/core/notifications src/jobs package.json tests/integration/notifications tests/integration/jobs
git commit -m "feat: deliver durable business bot notifications"
```

### Task 7: Commands, dashboard guidance and whole-feature verification

**Files:**
- Modify: `scripts/register-platform-telegram-webhook.ts`
- Modify: `src/features/dashboard/telegram-integration-form.tsx`
- Modify: `src/i18n/ru.json`
- Modify only with authentic translations if available: `src/i18n/tg.json`
- Modify: `docs/pilot-runbook.md`
- Create: `tests/integration/integrations/business-bot-security.test.ts`
- Modify relevant Telegram tests for the final command/menu contracts.

**Interfaces:**
- Consumes all previous tasks.
- Produces registration of `/start`, `/menu`, `/today`, `/bookings`, `/checks`, `/help` and accurate dashboard setup guidance.

- [ ] **Step 1: Write failing command and security tests**

Assert `setMyCommands`, unlinked/stale/forbidden paths, secret-free errors, group callback actor enforcement, cross-tenant denial, duplicate update handling and complete navigation back to main menu.

- [ ] **Step 2: Run RED tests**

Run: `pnpm test tests/integration/integrations/business-bot-security.test.ts tests/unit/integrations/telegram-api.test.ts`

Expected: FAIL on missing command registration or incomplete state recovery.

- [ ] **Step 3: Complete commands, setup copy and runbook**

Explain clearly that `@manclient_bot` is for the team and the connected business bot is for clients. Show personal/group privacy implications and disconnect controls. Do not expose a control that is not operational.

- [ ] **Step 4: Run feature verification**

Run:

```bash
pnpm test tests/unit/integrations tests/integration/integrations tests/integration/notifications tests/integration/jobs tests/integration/booking-operations tests/integration/payments
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: all commands exit 0 without new warnings.

- [ ] **Step 5: Self-review against the design spec**

Check every section of `docs/superpowers/specs/2026-07-29-business-telegram-interface-design.md`; record direct code/test evidence for personal chat, group security, roles, menus, bookings, review queue, notifications, stale/error states and privacy.

- [ ] **Step 6: Commit**

```bash
git add scripts src/features/dashboard src/i18n docs/pilot-runbook.md tests
git commit -m "feat: complete business Telegram workspace"
```
