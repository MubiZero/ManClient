# W0 Pilot Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the W0 user-facing blockers in ManClient's Telegram and web booking/payment flows without changing the booking, payment, or tenant-security model.

**Architecture:** Keep domain mutations in the existing booking and payment services. Add presentation-level helpers for Telegram keyboard layout and web confirmation, then cover the visible behavior with focused unit, integration, and browser tests. Production webhook and Telegram accounts are not changed by this work.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma 7, Vitest, Playwright, Telegram Bot API.

## Global Constraints

- Preserve tenant scope, RBAC, opaque Telegram callback IDs, and idempotent booking operations.
- Use Russian copy in the current web surface; do not introduce partial Tajik copies in this W0 change.
- Keep dangerous actions explicit: a customer can back out of cancellation; a business user must see what a web mutation will do before submitting it.
- Do not perform a production deploy, create a real Telegram bot, send Telegram messages, or rotate credentials.
- Test every behavior before implementation and keep unrelated source changes out of the branch.

---

### Task 1: Align platform command menu with the business assistant

**Files:**
- Modify: `src/integrations/telegram/business-bot-handler.ts`
- Modify: `tests/integration/integrations/business-bot-handler.test.ts`

**Interfaces:**
- Consumes: Telegram text updates from `handlePlatformTelegramUpdate`.
- Produces: `/today`, `/bookings`, and `/checks` responses matching their visible menu counterparts.

- [ ] **Step 1: Write failing command-alias integration tests**

Add three focused cases that send `/today`, `/bookings`, and `/checks` through `handleBusinessBotUpdate`; assert the resulting message respectively contains today's list, booking filters, and the payment-review queue.

- [ ] **Step 2: Run the new tests and verify the current default help response fails the assertions**

Run: `pnpm test -- tests/integration/integrations/business-bot-handler.test.ts`

- [ ] **Step 3: Add the slash-command aliases to the existing switch**

Map `/today` to the same branch as `Сегодня`, `/bookings` to `Записи`, and `/checks` to `Проверить чеки`; do not add a second command dispatcher.

- [ ] **Step 4: Re-run the focused test**

Run: `pnpm test -- tests/integration/integrations/business-bot-handler.test.ts`

### Task 2: Make customer Telegram keyboard navigation compact and recoverable

**Files:**
- Modify: `src/integrations/telegram/conversation-renderer.ts`
- Modify: `src/integrations/telegram/business-update-handler.ts`
- Modify: `tests/integration/integrations/telegram-booking-flow.test.ts`
- Create: `tests/unit/integrations/conversation-renderer.test.ts`

**Interfaces:**
- Consumes: `TelegramConversationButton[]` from conversation states.
- Produces: compact inline keyboard rows while retaining signed opaque callback IDs.

- [ ] **Step 1: Write failing renderer tests for two-column dates, three-column time slots, and separate navigation rows**

Assert that compact option rows never contain more than the requested column count and that `Назад` and `В меню` remain distinct bottom rows.

- [ ] **Step 2: Run the renderer test and verify the missing helper causes failure**

Run: `pnpm test -- tests/unit/integrations/conversation-renderer.test.ts`

- [ ] **Step 3: Add a small grid helper without changing the existing one-action-per-row default**

Expose a dedicated helper used only for short labels such as dates and slots. Long business names stay one per row.

- [ ] **Step 4: Write failing customer-flow tests for a cancellation escape and booking-summary editing**

Assert a cancellation prompt renders both `Да, отменить` and `Не отменять`; assert booking confirmation provides a route back to time selection and that reschedule dates expose a return-to-booking action.

- [ ] **Step 5: Run the customer-flow test and verify it fails for missing actions**

Run: `pnpm test -- tests/integration/integrations/telegram-booking-flow.test.ts`

- [ ] **Step 6: Implement only the required action branches and views**

Add `CLIENT_CANCEL_DISMISS`, make `CONFIRM` return to `SLOT`, render dates and time in compact grids, and give reschedule selection a safe route back to the current booking card.

- [ ] **Step 7: Re-run focused Telegram tests**

Run: `pnpm test -- tests/unit/integrations/conversation-renderer.test.ts tests/integration/integrations/telegram-booking-flow.test.ts`

### Task 3: Give the payment page the information needed to make a transfer safely

**Files:**
- Modify: `src/core/payments/receipt-submission-service.ts`
- Modify: `src/features/public-payment/payment-page.tsx`
- Modify: `tests/unit/public-payment/payment-page.test.tsx`

**Interfaces:**
- Consumes: `getPublicPayment(paymentId)`.
- Produces: booking date/time, staff name, formatted amount, and a visible remaining hold time while payment is pending.

- [ ] **Step 1: Write failing payment-page tests for visit context and a pending hold indicator**

Render a pending payment and assert service, branch, staff, local date/time, amount, and a countdown label are visible; render an expired booking and assert payment/upload controls are absent with a clear recovery message.

- [ ] **Step 2: Run the new payment-page test and verify it fails because staff, date/time, and hold state are not rendered**

Run: `pnpm test -- tests/unit/public-payment/payment-page.test.tsx`

- [ ] **Step 3: Extend the public payment projection with only staff and branch timezone**

Do not expose card, internal IDs, or other customer data.

- [ ] **Step 4: Render a client-side, second-aligned remaining-hold label and an explicit expired state**

The state is derived from the server-issued `expiresAt`; the page continues to rely on server validation for actual mutations.

- [ ] **Step 5: Re-run the payment-page test**

Run: `pnpm test -- tests/unit/public-payment/payment-page.test.tsx`

### Task 4: Require web confirmation before business mutations and remove free-form reschedule time entry

**Files:**
- Modify: `src/app/(dashboard)/dashboard/bookings/[bookingId]/page.tsx`
- Create: `src/features/dashboard/bookings/booking-mutation-form.tsx`
- Modify: `tests/e2e/booking-operations.spec.ts`
- Create: `tests/unit/dashboard/booking-mutation-form.test.tsx`

**Interfaces:**
- Consumes: server actions for confirmation, cancellation, and rescheduling plus the existing availability endpoint.
- Produces: explicit confirmation dialogs and only real available time slots for rescheduling.

- [ ] **Step 1: Write failing component tests for confirmation copy and safe dismiss actions**

Assert manual confirmation, reschedule, and cancellation each expose a descriptive confirmation dialog; cancellation must name the visit and leave a visible `Не отменять` action.

- [ ] **Step 2: Run the component test and verify it fails because the forms submit immediately**

Run: `pnpm test -- tests/unit/dashboard/booking-mutation-form.test.tsx`

- [ ] **Step 3: Implement a focused client mutation form around the existing server actions**

Use the existing `Dialog` primitive, submit only after confirmation, disable only during submission, and preserve server-side authorization and validation.

- [ ] **Step 4: Replace `datetime-local` with availability-backed date and slot selection**

Keep the mutation server action unchanged; the client selects a returned ISO start time and sends it only after explicit confirmation.

- [ ] **Step 5: Extend the browser regression to verify cancel confirmation and slot-based reschedule**

The test must open the dialog, dismiss once, then confirm; it must select an available slot rather than fill arbitrary time.

- [ ] **Step 6: Run focused unit and browser checks**

Run: `pnpm test -- tests/unit/dashboard/booking-mutation-form.test.tsx && pnpm playwright test tests/e2e/booking-operations.spec.ts`

### Task 5: Full verification and handoff

**Files:**
- Verify only.

- [ ] **Step 1: Generate Prisma client and run static checks**

Run: `pnpm prisma generate && pnpm lint && pnpm typecheck`

- [ ] **Step 2: Run the full Vitest suite against the isolated local database**

Run: `pnpm test`

- [ ] **Step 3: Run the relevant Playwright flows with a seeded local database**

Run: `pnpm playwright test tests/e2e/booking-operations.spec.ts tests/e2e/public-booking.spec.ts`

- [ ] **Step 4: Inspect the diff, commit only W0 files, and report the external production smoke still required**

Run: `git diff --check && git status --short`
