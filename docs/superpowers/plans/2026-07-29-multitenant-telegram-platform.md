# Multi-tenant Telegram Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate the ManClient business assistant from tenant-owned customer bots, then deliver a complete tenant-safe Telegram booking and receipt flow over shared domain services.

**Architecture:** A global platform webhook handles authenticated business operations only. Every business customer bot has an encrypted credential and random tenant webhook route. Both Telegram and web call the same booking, availability, payment, and receipt services; a durable versioned conversation state machine translates channel events into domain commands.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 7/PostgreSQL, NextAuth 5, Vitest, Playwright, Telegram Bot API, AES-256-GCM, existing pg-boss/message infrastructure.

## Global Constraints

- One active customer Telegram bot per business; one Telegram bot ID may belong to only one active business.
- `@manclient_bot` is business-only and never accepts customer bookings or receipts.
- Tenant resolution comes only from a random integration `publicId`, never from Telegram payload data.
- Bot tokens and webhook secrets are encrypted with a dedicated base64 32-byte `INTEGRATION_ENCRYPTION_KEY` and never returned by read APIs or written to logs/audit metadata.
- Dashboard connection is preferred; chat connection is allowed only after signed, short-lived, single-use membership linking and the token message is deleted immediately.
- Telegram, web, and future WhatsApp adapters reuse domain services; no channel-specific availability or allocation rules.
- Conversation callbacks use opaque server-side action IDs and inbound Telegram updates are idempotent.
- Russian and Tajik customer copy must be complete; no copied Russian strings masquerading as Tajik localization.
- Production migration is additive. Legacy customer webhook removal happens only after platform and tenant routes are verified.

---

### Task 1: Credential primitives and additive tenant schema

**Files:**
- Create: `src/core/security/secret-encryption.ts`
- Create: `tests/unit/security/secret-encryption.test.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260729_multitenant_telegram_platform/migration.sql`
- Modify: `tests/helpers/booking-fixture.ts`

**Interfaces:**
- Produces: `encryptSecret(plaintext: string, encodedKey: string): string` and `decryptSecret(ciphertext: string, encodedKey: string): string`.
- Produces Prisma models `BusinessTelegramIntegration`, `BusinessTelegramChat`, `Conversation`, `ConversationSession`, `ConversationAction`, and `InboundChannelUpdate` plus their enums and relations.

- [ ] **Step 1: Write failing encryption and schema contract tests**

```ts
test("encrypts an integration token with authenticated encryption", () => {
  const key = Buffer.alloc(32, 9).toString("base64");
  const ciphertext = encryptSecret("123:telegram-token", key);
  expect(ciphertext).not.toContain("telegram-token");
  expect(decryptSecret(ciphertext, key)).toBe("123:telegram-token");
  expect(() => decryptSecret(`${ciphertext}x`, key)).toThrow();
});
```

Add a Prisma-backed integration test that creates two businesses and proves `botId` and active `businessId` uniqueness, `InboundChannelUpdate(integrationId, externalUpdateId)` uniqueness, and one active session per conversation.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm test tests/unit/security/secret-encryption.test.ts tests/integration/integrations/telegram-schema.test.ts
```

Expected: fail because the secret module and Prisma models do not exist.

- [ ] **Step 3: Implement the primitive and additive schema**

Use AES-256-GCM with a 12-byte random IV and a `iv.tag.ciphertext` base64url format. The decoder error must name `INTEGRATION_ENCRYPTION_KEY`, not the card key.

Add enums:

```prisma
enum TelegramIntegrationStatus { PENDING ACTIVE ERROR DISCONNECTED }
enum ConversationStatus { ACTIVE WAITING_FOR_OPERATOR CLOSED }
enum ConversationChannel { TELEGRAM WHATSAPP WEB }
```

Implement the exact fields from the approved spec. Use partial PostgreSQL unique indexes in handwritten migration SQL where Prisma cannot express “one active integration/session”; keep historical disconnected rows.

- [ ] **Step 4: Generate Prisma and verify GREEN**

Run:

```bash
DATABASE_URL='postgresql://manclient:manclient@127.0.0.1:5432/manclient' pnpm prisma migrate deploy
pnpm db:generate
DATABASE_URL='postgresql://manclient:manclient@127.0.0.1:5432/manclient' pnpm test tests/unit/security/secret-encryption.test.ts tests/integration/integrations/telegram-schema.test.ts
```

Expected: all focused tests pass and the migration applies to a clean/local database.

- [ ] **Step 5: Commit**

```bash
git add prisma src/core/security tests
git commit -m "feat: add tenant Telegram integration schema"
```

### Task 2: Token-aware Telegram API adapter and atomic integration lifecycle

**Files:**
- Create: `src/integrations/telegram/telegram-api.ts`
- Create: `src/core/integrations/business-telegram-service.ts`
- Create: `tests/unit/integrations/telegram-api.test.ts`
- Create: `tests/integration/integrations/business-telegram-service.test.ts`
- Modify: `src/integrations/telegram/telegram-client.ts`

**Interfaces:**
- Produces `TelegramApi` with `getMe`, `setWebhook`, `deleteWebhook`, `sendMessage`, `deleteMessage`, `getFile`, and `downloadFile`, all accepting a token explicitly.
- Produces `connectBusinessTelegramBot(input, dependencies)`, `rotateBusinessTelegramBot(input, dependencies)`, `disconnectBusinessTelegramBot(input, dependencies)`, and `getBusinessTelegramStatus(businessId)`.

- [ ] **Step 1: Write failing adapter contract tests**

Use a local deterministic `fetch` fake and assert that errors expose only method/status/safe Telegram description, never the request URL or token. Test `getMe` requires `is_bot=true` and a username.

- [ ] **Step 2: Write failing lifecycle integration tests**

Cover:

```ts
await expect(connectBusinessTelegramBot({ businessId, actorUserId, token }, fakeTelegram))
  .resolves.toMatchObject({ status: "ACTIVE", botUsername: "demo_business_bot" });
expect(await prisma.businessTelegramIntegration.findFirst()).toMatchObject({ botTokenEncrypted: expect.not.stringContaining(token) });
```

Also prove unauthorized staff rejection, duplicate bot rejection without revealing the other business, webhook-registration rollback, successful rotation preserving the old integration until cutover, and disconnect clearing ciphertext only after `deleteWebhook` succeeds.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
DATABASE_URL='postgresql://manclient:manclient@127.0.0.1:5432/manclient' pnpm test tests/unit/integrations/telegram-api.test.ts tests/integration/integrations/business-telegram-service.test.ts
```

Expected: fail on missing interfaces.

- [ ] **Step 4: Implement minimal token-aware adapter and lifecycle service**

The service must check current `OWNER`/`ADMIN` membership, call `getMe`, generate 32 random public bytes and webhook secret, register `https://<APP_URL>/api/webhooks/telegram/business/<publicId>`, then commit the encrypted integration and a token-free audit record. Map failures to stable codes: `INVALID_BOT_TOKEN`, `BOT_ALREADY_CONNECTED`, `TELEGRAM_UNAVAILABLE`, `FORBIDDEN`.

- [ ] **Step 5: Verify GREEN and commit**

```bash
DATABASE_URL='postgresql://manclient:manclient@127.0.0.1:5432/manclient' pnpm test tests/unit/integrations/telegram-api.test.ts tests/integration/integrations/business-telegram-service.test.ts
git add src/integrations/telegram src/core/integrations tests
git commit -m "feat: manage encrypted business Telegram bots"
```

### Task 3: Business assistant identity linking and business-only behavior

**Files:**
- Create: `src/core/integrations/platform-chat-link.ts`
- Create: `src/integrations/telegram/platform-update-handler.ts`
- Create: `src/app/api/webhooks/telegram/platform/route.ts`
- Create: `src/app/api/integrations/telegram/platform-link/route.ts`
- Create: `tests/integration/integrations/platform-telegram-webhook.test.ts`
- Modify: `src/core/bookings/booking-action-token.ts` only if token primitives can be safely generalized without weakening booking tokens.

**Interfaces:**
- Produces `createPlatformChatLink({ businessId, userId, expiresAt }): Promise<string>` backed by a single-use database record plus signed opaque token.
- Produces `handlePlatformTelegramUpdate(update, dependencies): Promise<void>`.

- [ ] **Step 1: Write failing platform behavior tests**

Prove:

- plain `/start` returns business welcome plus an HTTPS login button and contains no receipt/customer-booking copy;
- a signed link can be used once, expires after 15 minutes, and rechecks membership;
- a linked owner can send a valid bot token, which is connected through Task 2 and whose Telegram message is deleted;
- an unlinked chat cannot connect a bot;
- a user with multiple memberships must select a business before mutation.

- [ ] **Step 2: Run tests and verify RED**

```bash
DATABASE_URL='postgresql://manclient:manclient@127.0.0.1:5432/manclient' pnpm test tests/integration/integrations/platform-telegram-webhook.test.ts
```

- [ ] **Step 3: Implement platform route and handler**

Keep the global `TELEGRAM_BOT_TOKEN` only inside the platform adapter. Delete token messages in `finally` after extraction; all responses say whether connection succeeded without echoing credentials. The webhook route uses `TELEGRAM_WEBHOOK_SECRET` and the existing timing-safe comparison extracted to a shared helper.

- [ ] **Step 4: Verify GREEN and commit**

```bash
DATABASE_URL='postgresql://manclient:manclient@127.0.0.1:5432/manclient' pnpm test tests/integration/integrations/platform-telegram-webhook.test.ts
git add src/app/api/integrations src/app/api/webhooks/telegram/platform src/core/integrations src/integrations/telegram tests
git commit -m "feat: make ManClient bot a business assistant"
```

### Task 4: Tenant webhook isolation and idempotent dispatch

**Files:**
- Create: `src/app/api/webhooks/telegram/business/[publicId]/route.ts`
- Create: `src/integrations/telegram/business-update-dispatcher.ts`
- Create: `src/core/integrations/inbound-update-service.ts`
- Create: `tests/integration/integrations/business-telegram-webhook.test.ts`
- Modify: `src/app/api/webhooks/telegram/route.ts`

**Interfaces:**
- Produces `claimInboundUpdate({ integrationId, externalUpdateId }): Promise<boolean>`.
- Produces tenant webhook dispatch context `{ businessId, integrationId, token, update }` only after route authentication.

- [ ] **Step 1: Write failing isolation tests**

Create two businesses and integrations. Prove the route rejects the wrong tenant secret, ignores payload-supplied `businessId`, never reads another business's customer/payment, and processes the same Telegram `update_id` exactly once under concurrent delivery.

- [ ] **Step 2: Run tests and verify RED**

```bash
DATABASE_URL='postgresql://manclient:manclient@127.0.0.1:5432/manclient' pnpm test tests/integration/integrations/business-telegram-webhook.test.ts
```

- [ ] **Step 3: Implement route, claim, and dispatcher boundary**

Load by `publicId`, decrypt the tenant secret/token only after finding an `ACTIVE` integration, compare the header timing-safely, insert the unique inbound update claim, and acknowledge duplicates with `200`. Return `404` for unknown integrations and `401` for bad secrets without details. Change the legacy `/api/webhooks/telegram` route to `410 Gone` only after the new platform route is deployed in the same release.

- [ ] **Step 4: Verify GREEN and commit**

```bash
DATABASE_URL='postgresql://manclient:manclient@127.0.0.1:5432/manclient' pnpm test tests/integration/integrations/business-telegram-webhook.test.ts
git add src/app/api/webhooks/telegram src/core/integrations src/integrations/telegram tests
git commit -m "feat: isolate tenant Telegram webhooks"
```

### Task 5: Versioned conversation engine and localized action protocol

**Files:**
- Create: `src/core/conversations/conversation-engine.ts`
- Create: `src/core/conversations/conversation-state.ts`
- Create: `src/core/conversations/conversation-actions.ts`
- Create: `src/core/conversations/messages.ru.ts`
- Create: `src/core/conversations/messages.tg.ts`
- Create: `tests/unit/conversations/conversation-engine.test.ts`
- Create: `tests/integration/conversations/conversation-concurrency.test.ts`

**Interfaces:**
- Produces `handleConversationCommand(command, now): Promise<ConversationReply[]>`.
- Produces opaque `createConversationAction` and atomic `consumeConversationAction` with expiry and single-use semantics.
- State nodes: `LANGUAGE`, `BRANCH`, `SERVICE`, `STAFF`, `DATE`, `SLOT`, `CUSTOMER_NAME`, `CUSTOMER_PHONE`, `CONFIRM`, `AWAITING_PAYMENT`, `AWAITING_RECEIPT`, `COMPLETE`.

- [ ] **Step 1: Write failing state and localization tests**

Test every allowed transition, invalid/stale action rejection, session expiry, Russian and genuine Tajik message availability, and complete response text without fragment concatenation. Add a concurrency test proving two callbacks cannot advance one session twice.

- [ ] **Step 2: Run tests and verify RED**

```bash
DATABASE_URL='postgresql://manclient:manclient@127.0.0.1:5432/manclient' pnpm test tests/unit/conversations tests/integration/conversations
```

- [ ] **Step 3: Implement the engine**

Use serializable transactions or optimistic `version` updates for command application. Store only schema-validated JSON state. Actions contain a random identifier only; the database row carries business, conversation, kind, validated payload, expiry, and consumption time.

- [ ] **Step 4: Verify GREEN and commit**

```bash
DATABASE_URL='postgresql://manclient:manclient@127.0.0.1:5432/manclient' pnpm test tests/unit/conversations tests/integration/conversations
git add src/core/conversations tests/unit/conversations tests/integration/conversations
git commit -m "feat: add versioned booking conversation engine"
```

### Task 6: Complete Telegram booking, payment, and receipt journey

**Files:**
- Create: `src/integrations/telegram/business-update-handler.ts`
- Create: `src/integrations/telegram/conversation-renderer.ts`
- Modify: `src/app/api/bookings/route.ts`
- Modify: `src/features/public-booking/booking-form.tsx`
- Modify: `src/jobs/send-booking-reminder.ts`
- Replace customer responsibilities in: `src/integrations/telegram/update-handler.ts`
- Extend: `tests/integration/integrations/business-telegram-webhook.test.ts`
- Create: `tests/integration/integrations/telegram-booking-flow.test.ts`

**Interfaces:**
- Consumes Task 5 commands/replies and existing `getAvailableStarts`, `createPendingBooking`, `getPaymentUrl`, receipt recognition/confirmation, cancel, and reschedule services.
- Produces a full `/start` → confirmed booking Telegram journey scoped to one business bot.

- [ ] **Step 1: Write a failing full-flow test**

Drive deterministic Telegram updates through branch, service, staff, slot, contact sharing, booking hold, payment link, receipt image, and confirmation. Assert every selected entity belongs to the webhook business, the correct business bot token performs file/message operations, the payment goes to the selected branch card, and a second business cannot see or act on the booking.

- [ ] **Step 2: Write failing web compatibility tests**

Prove the web booking API now generates the deep link from the business's active integration username, never `TELEGRAM_BOT_USERNAME`, and returns `telegramUrl: null` when the tenant has no active bot.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
DATABASE_URL='postgresql://manclient:manclient@127.0.0.1:5432/manclient' pnpm test tests/integration/integrations/telegram-booking-flow.test.ts tests/integration/bookings/create-booking.test.ts
```

- [ ] **Step 4: Implement the adapter and reuse domain services**

Render channel-neutral replies as Telegram inline keyboards/contact requests. Resolve required resources deterministically for single-resource services; when multiple interchangeable resources exist, present only resources returned by tenant-scoped configuration. Preserve the existing 15-minute hold and receipt-review behavior.

- [ ] **Step 5: Verify GREEN and commit**

```bash
DATABASE_URL='postgresql://manclient:manclient@127.0.0.1:5432/manclient' pnpm test tests/integration/integrations/telegram-booking-flow.test.ts tests/integration/bookings tests/integration/payments
git add src/app/api/bookings src/features/public-booking src/integrations/telegram src/jobs tests
git commit -m "feat: deliver tenant Telegram booking flow"
```

### Task 7: Dashboard connection, rotation, and disconnection

**Files:**
- Create: `src/app/(dashboard)/dashboard/settings/integrations/page.tsx`
- Create: `src/features/dashboard/telegram-integration-form.tsx`
- Create: `src/app/api/integrations/telegram/route.ts`
- Create: `src/app/api/integrations/telegram/rotate/route.ts`
- Create: `src/app/api/integrations/telegram/disconnect/route.ts`
- Modify: `src/app/(dashboard)/dashboard/layout.tsx`
- Create: `tests/integration/integrations/telegram-dashboard-api.test.ts`
- Create: `tests/e2e/telegram-integration-settings.spec.ts`

**Interfaces:**
- Read API returns only `{ status, botUsername, connectedAt, lastWebhookError }`.
- Mutation APIs accept a token but never echo it and require current `OWNER`/`ADMIN` membership.

- [ ] **Step 1: Write failing API authorization/redaction tests**

Prove staff/other-tenant rejection, token redaction in success and error bodies, validated connect/rotate/disconnect behavior, and safe status projection.

- [ ] **Step 2: Write failing browser state tests**

Cover disconnected, checking, active, error, rotation rollback, mobile layout, focus-visible actions, and password-manager-safe token input with `autocomplete="off"` and no retained React state after success.

- [ ] **Step 3: Run tests and verify RED**

```bash
DATABASE_URL='postgresql://manclient:manclient@127.0.0.1:5432/manclient' pnpm test tests/integration/integrations/telegram-dashboard-api.test.ts
pnpm playwright test tests/e2e/telegram-integration-settings.spec.ts
```

- [ ] **Step 4: Implement settings UI and routes**

Use existing dashboard layout/auth helpers. Show the bot username and safe connection metadata only. Require explicit confirmation before disconnect; no token-read endpoint exists.

- [ ] **Step 5: Verify GREEN and commit**

```bash
DATABASE_URL='postgresql://manclient:manclient@127.0.0.1:5432/manclient' pnpm test tests/integration/integrations/telegram-dashboard-api.test.ts
pnpm playwright test tests/e2e/telegram-integration-settings.spec.ts
git add src/app src/features/dashboard tests
git commit -m "feat: manage Telegram integration in dashboard"
```

### Task 8: Runtime configuration, cutover documentation, and production release

**Files:**
- Modify: `.env.example`
- Modify: `docs/pilot-runbook.md`
- Create: `scripts/register-platform-telegram-webhook.ts`
- Modify: `package.json`
- Modify: deployment config only if required by verified runtime behavior.

**Interfaces:**
- Adds required runtime `INTEGRATION_ENCRYPTION_KEY`.
- Keeps `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, and `TELEGRAM_WEBHOOK_SECRET` explicitly named as platform-bot credentials.
- Adds `pnpm telegram:register-platform-webhook` without printing secrets.

- [ ] **Step 1: Write failing configuration/runbook checks**

Add a test that validates required production environment semantics and a script dry-run test that asserts the platform webhook URL is `/api/webhooks/telegram/platform` and output contains no token/secret.

- [ ] **Step 2: Implement configuration and migration runbook**

Document additive migration, key generation, platform webhook registration, tenant bot connection, rotation, rollback, webhook inspection, legacy route `410`, backup, and recovery. Never include real values.

- [ ] **Step 3: Run the complete local release gate**

```bash
pnpm prisma validate
pnpm lint
pnpm typecheck
DATABASE_URL='postgresql://manclient:manclient@127.0.0.1:5432/manclient' pnpm test
DATABASE_URL='postgresql://manclient:manclient@127.0.0.1:5432/manclient' AUTH_SECRET='local-auth-secret-at-least-32-characters' APP_URL='http://127.0.0.1:3000' AUTH_URL='http://127.0.0.1:3000' CARD_ENCRYPTION_KEY='BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=' INTEGRATION_ENCRYPTION_KEY='CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk=' INTERNAL_API_SECRET='local-internal-secret-at-least-32-characters' BOOKING_ACTION_SECRET='local-booking-secret-at-least-32-characters' pnpm build
```

Expected: schema validation, lint, typecheck, all tests, and production build exit 0.

- [ ] **Step 4: Commit and push the verified branch**

```bash
git add .env.example docs package.json scripts tests
git commit -m "docs: document multi-tenant Telegram operations"
git push origin main
```

- [ ] **Step 5: Perform the authorized production cutover**

Generate `INTEGRATION_ENCRYPTION_KEY` directly into Coolify secret storage without exposing it. Deploy the exact remote SHA, wait for the migration and new container health, register the platform webhook at `/api/webhooks/telegram/platform`, and verify the old `/api/webhooks/telegram` returns `410`.

- [ ] **Step 6: Run production smoke tests**

Verify exact deployment SHA/image, application/PostgreSQL/MinIO health, Cloudflare and direct-origin `/api/health`, plain platform `/start` business welcome, platform linking rejection for invalid/expired tokens, tenant webhook secret rejection, one real tenant test bot `/start`, and no Telegram `last_error_message`. Do not create a charge; use a controlled zero-side-effect or disposable pilot booking configuration.

- [ ] **Step 7: Clean temporary QA artifacts and report**

Remove temporary tokens, response bodies, and screenshots outside the repository. Report exact SHA/deployment UUID, migration, health evidence, test counts, remaining rollout stages, and any production metadata lag separately from verified image/runtime evidence.

## Plan self-review

- Every requirement in the approved spec needed for stages 1–2 maps to Tasks 1–8.
- Tenant identity, token secrecy, idempotency, concurrency, rollback, localization, dashboard lifecycle, and production cutover have explicit tests.
- Later operator handover, WhatsApp, CRM campaigns, and analytics remain in the architecture spec but are intentionally excluded from this implementation cycle.
- Interface names are consistent across producer and consumer tasks; no placeholder implementation steps remain.
