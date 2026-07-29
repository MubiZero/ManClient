# Managed Client Bot Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner create the only business-owned customer bot through Telegram Managed Bots while the shared `@manclient_bot` remains the team assistant.

**Architecture:** Extend the current platform Bot API webhook with managed-bot updates and keep a short-lived database intent that binds the Telegram creator to one authorized business membership. Reuse `connectBusinessTelegramBot` for token encryption, tenant webhook registration, audit, and isolation; expose the preferred flow through the existing dashboard and business assistant while retaining dashboard token entry for existing bots.

**Tech Stack:** Next.js 16 Route Handlers, React 19, TypeScript 5.9, Prisma 7/PostgreSQL, Telegram Bot API 9.6, Vitest, Playwright.

## Global Constraints

- A business creates one customer bot; owners and staff use the shared `@manclient_bot`.
- The customer owns a managed bot from creation; ManClient never automates a Telegram user session or temporarily owns the bot.
- No bot token, webhook secret, Telegram OTP, password, 2FA value, or user session may enter logs, audit metadata, responses, or chat messages.
- Only an active linked `OWNER` or `ADMIN` may start or complete managed connection.
- Existing token-connected bots and tenant webhook routes remain compatible.
- Production bot creation, transfer, disconnection, deletion, or deployment requires separate explicit approval.

---

### Task 1: Persist single-use managed-bot intents

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260729XXXXXX_managed_bot_onboarding/migration.sql`
- Create: `src/core/integrations/managed-bot-intent.ts`
- Create: `tests/integration/integrations/managed-bot-intent.test.ts`

**Interfaces:**
- Produces: `createManagedBotIntent(actor, names, now)`, `claimManagedBotIntent(update, now)`, and `completeManagedBotIntent(intentId, botId, now)`.
- Intent creation consumes a resolved platform actor with `membershipId`, `businessId`, `userId`, `role`, and `telegramUserId`.

- [ ] **Step 1: Write failing integration tests** for owner/admin creation, staff rejection, previous-intent expiration, wrong Telegram user, expired intent, revoked membership, and idempotent completion.
- [ ] **Step 2: Run** `pnpm vitest run tests/integration/integrations/managed-bot-intent.test.ts` and confirm failures are caused by the absent model/service.
- [ ] **Step 3: Add schema and migration** with `ManagedBotConnectionIntent`, `ManagedBotConnectionStatus`, `TelegramConnectionMethod`, plus `connectionMethod`, `managedOwnerTelegramUserId`, and `managedAt` on `BusinessTelegramIntegration`; existing integrations migrate to `TOKEN`.
- [ ] **Step 4: Implement the service** using serializable transactions, a 30-minute expiry, one pending intent per membership, and current membership-role checks during both creation and claim.
- [ ] **Step 5: Generate Prisma Client and rerun the targeted test** with `pnpm prisma generate && pnpm vitest run tests/integration/integrations/managed-bot-intent.test.ts`.
- [ ] **Step 6: Commit** schema, migration, service, and tests as `feat: add managed bot connection intents`.

### Task 2: Support Telegram Bot API 9.6 managed-bot operations

**Files:**
- Modify: `src/integrations/telegram/telegram-api.ts`
- Modify: `tests/unit/integrations/telegram-api.test.ts`

**Interfaces:**
- Produces: `getManagedBotToken(userId: number): Promise<string>` and capability data from `getMe()` including `canManageBots`.
- Produces managed update types with `managed_bot.user` and `managed_bot.bot` identities.

- [ ] **Step 1: Write failing unit tests** asserting the exact `getManagedBotToken` HTTP method/body, `can_manage_bots` normalization, bounded Telegram error handling, and absence of token text from thrown errors.
- [ ] **Step 2: Run** `pnpm vitest run tests/unit/integrations/telegram-api.test.ts` and confirm expected failures.
- [ ] **Step 3: Extend the narrow API adapter** without adding an MTProto dependency or logging response bodies.
- [ ] **Step 4: Rerun the targeted unit tests** and ensure existing Telegram methods remain green.
- [ ] **Step 5: Commit** as `feat: support Telegram managed bot API`.

### Task 3: Create and complete managed bots through `@manclient_bot`

**Files:**
- Modify: `src/integrations/telegram/platform-update-handler.ts`
- Modify: `src/integrations/telegram/business-bot-handler.ts`
- Modify: `src/integrations/telegram/business-bot-renderer.ts`
- Modify: `src/core/integrations/business-telegram-service.ts`
- Modify: `tests/integration/integrations/platform-telegram-webhook.test.ts`
- Modify: `tests/integration/integrations/business-telegram-service.test.ts`
- Modify: `tests/integration/integrations/business-bot-handler.test.ts`
- Modify: `tests/unit/integrations/business-bot-renderer.test.ts`

**Interfaces:**
- Consumes: intent service from Task 1 and `getManagedBotToken` from Task 2.
- Produces: a `Создать клиентского бота` assistant action and managed-update completion through the shared connection service.

- [ ] **Step 1: Write failing handler tests** for generating an encoded `t.me/newbot/manclient_bot/...` link only in a linked private owner/admin chat, refusing staff/group chats, and creating an intent before sending the link.
- [ ] **Step 2: Run the focused handler tests** and verify they fail on missing actions and update support.
- [ ] **Step 3: Implement the creation action** with server-normalized display name/username suggestions and no trusted business data in Telegram links.
- [ ] **Step 4: Write failing completion tests** for matching user/intent, fetching the token, checking bot identity, successful connection, duplicate update, wrong user, expired intent, token-export failure, webhook rollback, and secret-free messages.
- [ ] **Step 5: Run the completion tests** and verify the expected failures.
- [ ] **Step 6: Extend `connectBusinessTelegramBot`** with explicit `connectionMethod` and managed-owner metadata while retaining the current token API as `TOKEN`.
- [ ] **Step 7: Handle `managed_bot` updates** before message/callback routing, complete the intent idempotently, and report a safe retry path when Telegram creation succeeded but ManClient connection failed.
- [ ] **Step 8: Rerun all focused Telegram integration/unit tests** and fix only regressions related to this flow.
- [ ] **Step 9: Commit** as `feat: connect customer bots through manclient bot`.

### Task 4: Make managed creation the primary dashboard journey

**Files:**
- Modify: `src/app/(dashboard)/dashboard/settings/integrations/page.tsx`
- Modify: `src/features/dashboard/telegram-integration-form.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/e2e/telegram-integration-settings.spec.ts`
- Modify: `tests/unit/dashboard/settings-forms.test.tsx`

**Interfaces:**
- Consumes: existing `POST /api/integrations/telegram/platform-link`; managed creation itself continues in `@manclient_bot`.
- Preserves: existing `POST /api/integrations/telegram` for the secondary existing-bot form.

- [ ] **Step 1: Write failing rendered-component and browser assertions** for the one-bot explanation, `Привязать Telegram к @manclient_bot`, preferred `Создать клиентского бота` journey, collapsed `Подключить существующего бота`, accessible loading/error states, and narrow-screen layout.
- [ ] **Step 2: Run** `pnpm vitest run tests/unit/dashboard/settings-forms.test.tsx` and the targeted Playwright spec where its seeded environment is available; confirm failures match stale copy/controls.
- [ ] **Step 3: Refactor the component state** so the managed path is visually primary, token entry is opt-in, requests do not waterfall, in-flight buttons prevent duplicate submissions, and focus-visible/touch targets reuse current project styles.
- [ ] **Step 4: Update CSS** within the existing restrained SaaS direction: `DESIGN_VARIANCE=3`, `MOTION_INTENSITY=2`, `VISUAL_DENSITY=4`; no unrelated typography or palette change.
- [ ] **Step 5: Rerun component tests and browser coverage**, recording any unavailable seeded E2E prerequisite honestly.
- [ ] **Step 6: Commit** as `feat: simplify Telegram bot onboarding`.

### Task 5: Align onboarding copy and operational setup

**Files:**
- Modify: `src/features/onboarding/onboarding-checklist.tsx`
- Modify: `src/app/register/page.tsx`
- Modify: `src/integrations/telegram/platform-update-handler.ts`
- Modify: `.env.example`
- Modify: `scripts/register-platform-telegram-webhook.ts`
- Modify: `docs/pilot-runbook.md`
- Modify: `tests/unit/onboarding/registration-pages.test.tsx`
- Modify: `tests/unit/config/telegram-runtime.test.ts`

**Interfaces:**
- Startup registration verifies platform `can_manage_bots` and registers all update types needed for messages, callbacks, and `managed_bot`.

- [ ] **Step 1: Write failing copy/config tests** proving that only one business-created bot is requested and that platform capability failure is explicit without exposing credentials.
- [ ] **Step 2: Run the targeted tests** and confirm they fail against the old two-channel wording/config behavior.
- [ ] **Step 3: Update copy and runbook** to distinguish “business creates one customer bot” from “team links the ready-made assistant.”
- [ ] **Step 4: Add capability verification** to platform webhook registration and document the BotFather Management Mode prerequisite.
- [ ] **Step 5: Rerun targeted tests** and review all user-visible Telegram copy with `rg` for stale “create/connect two bots” implications.
- [ ] **Step 6: Commit** as `docs: align Telegram managed bot onboarding`.

### Task 6: Full verification and handoff

**Files:**
- Modify only files required to correct feature-related failures.

**Interfaces:**
- Verifies the complete implementation; does not deploy or create a production Telegram bot.

- [ ] **Step 1: Run targeted suites** for Telegram API, intents, platform webhook, business integration, assistant rendering/handlers, onboarding, and settings.
- [ ] **Step 2: Run** `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- [ ] **Step 3: Run** `pnpm build` with safe local build configuration.
- [ ] **Step 4: Run the Telegram settings Playwright spec** if the documented seeded database credentials are available; otherwise report the exact missing prerequisite.
- [ ] **Step 5: Inspect** `git diff --check`, migration SQL, secret-bearing paths, and final `git status`; ensure unrelated files are untouched.
- [ ] **Step 6: Request code review, address only actionable findings, and provide a concise handoff with tests run and the explicitly unperformed production smoke/deploy.

