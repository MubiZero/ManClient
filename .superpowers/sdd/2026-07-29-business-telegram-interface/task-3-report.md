# Task 3 — Role-scoped dashboard, booking lists and cards

## Result

- Added owner/admin and staff-scoped business-bot summary, booking lists, stable
  cursor pagination, and safe booking details through the shared booking access
  boundary.
- `today` builds a UTC window per branch timezone, so one business can safely
  operate branches in different local dates.
- Added opaque persisted actions bound to business, application user, Telegram
  user, chat, and expiry. Navigation remains repeatable; mutation-mode actions
  are atomically one-shot.
- The platform bot now serves `/start`, `/menu`, `/help`, native reply-menu
  choices and acknowledged callbacks, while preserving signed chat linking and
  customer-bot token connection.

## TDD evidence

1. RED: the required targeted command exited 1 with both suites failing because
   `business-bot-query-service` and `business-bot-handler` did not exist.
2. GREEN: after the minimal query/action/handler implementation, the required
   three-file command passed 16/16.
3. RED regression: the booking-card flow exposed the normalized phone without
   the shared Tajik presentation format; its focused test failed on
   `+992900001177` versus `+992 90 000 11 77`.
4. GREEN regression: the handler now uses `formatTajikPhoneInput`; the focused
   flow passed. A second RED/GREEN removed the visible but non-functional
   `Настройки` reply button from this task's menu.

## Verification

- `pnpm test tests/integration/integrations/business-bot-query.test.ts tests/integration/integrations/business-bot-handler.test.ts tests/integration/integrations/platform-telegram-webhook.test.ts` — 3 files, 16 tests passed.
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `git diff --check` — passed.

## Files

- `src/core/integrations/business-bot-query-service.ts`
- `src/core/integrations/business-bot-actions.ts`
- `src/integrations/telegram/business-bot-handler.ts`
- `src/integrations/telegram/platform-update-handler.ts`
- `tests/integration/integrations/business-bot-query.test.ts`
- `tests/integration/integrations/business-bot-handler.test.ts`
- `tests/integration/integrations/platform-telegram-webhook.test.ts`

## Self-review and concerns

- Booking access is re-derived with `requireBookingAccess`; neither callback
  payloads nor the role copied into the handler are trusted for row scope.
- Callback data contains only the opaque `ConversationAction.id`; semantic kind,
  booking id, actor binding and policy remain server-side.
- Every callback is acknowledged before database/rendering work. Editable
  messages are updated in place and fall back to a fresh message when Telegram
  rejects an edit.
- Booking mutations and payment-review decisions are intentionally absent; this
  task exposes status and navigation only. The platform route's webhook-secret
  boundary and the tenant customer-bot webhook were not changed.
