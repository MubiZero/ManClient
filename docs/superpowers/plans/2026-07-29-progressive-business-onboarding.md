# Progressive Business Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Статус на 2026-08-07: реализовано.** Сверено с кодом; `pnpm lint`, `pnpm typecheck` и `pnpm vitest run tests/unit tests/integration` (113 файлов, 474 теста) проходят.
>
> Расхождения с планом: Удаления выполнены: `src/core/onboarding/complete-business-setup.ts` и его тест в репозитории отсутствуют.

**Goal:** Replace the combined setup form with a resumable service → payment → ready wizard and allow eight-character registration passwords.

**Architecture:** The server derives the current step from real tenant data instead of storing a separate onboarding flag. Two tenant-scoped commands persist the first service and the encrypted DushanbeCity card independently; the dashboard page selects one focused form or the completion screen from those results.

**Tech Stack:** Next.js App Router and server actions, React, Prisma/PostgreSQL, Zod, Vitest, Playwright, CSS.

## Global Constraints

- Every query and mutation is scoped by `businessId` and restricted to OWNER or ADMIN.
- First-service creation is idempotent under repeat submission and must not create duplicates.
- Card numbers remain encrypted at rest; only the final four digits are shown after setup.
- No new database onboarding flag or schema migration.
- Existing password hashes and legacy email login remain compatible.
- Telegram remains optional and is offered only after core setup is complete.

---

### Task 1: Eight-character registration password

**Files:**
- Modify: `src/core/onboarding/register-business.ts`
- Modify: `src/features/onboarding/registration-form.tsx`
- Modify: `src/app/register/page.tsx`
- Modify: `tests/integration/onboarding/register-business.test.ts`
- Modify: `tests/unit/onboarding/registration-pages.test.tsx`
- Modify: `tests/e2e/web-business-onboarding.spec.ts`

**Interfaces:**
- Consumes: existing `registerBusiness(input)` and registration server action.
- Produces: registration accepting password lengths from 8 through 128 characters.

- [x] **Step 1: Write failing tests**

Add an integration case that registers successfully with `password: "12345678"`, and update the rendered-form assertion to require `minLength={8}` plus the copy `Минимум 8 символов`.

- [x] **Step 2: Verify the tests fail**

Run: `pnpm vitest run tests/integration/onboarding/register-business.test.ts tests/unit/onboarding/registration-pages.test.tsx`

Expected: the eight-character password is rejected and the form still exposes 12.

- [x] **Step 3: Implement the requirement**

Change the registration Zod constraint and input attribute from 12 to 8. Update the invalid-input message to `Пароль должен содержать минимум 8 символов.` Keep the 128-character ceiling unchanged.

- [x] **Step 4: Verify targeted tests pass**

Run: `pnpm vitest run tests/integration/onboarding/register-business.test.ts tests/unit/onboarding/registration-pages.test.tsx`

Expected: PASS.

### Task 2: Split setup persistence into tenant-safe commands

**Files:**
- Create: `src/core/onboarding/create-first-service.ts`
- Create: `src/core/onboarding/save-payment-card.ts`
- Create: `src/core/onboarding/onboarding-step-error.ts`
- Delete: `src/core/onboarding/complete-business-setup.ts`
- Create: `tests/integration/onboarding/create-first-service.test.ts`
- Create: `tests/integration/onboarding/save-payment-card.test.ts`
- Delete: `tests/integration/onboarding/complete-business-setup.test.ts`

**Interfaces:**
- Produces: `createFirstService({ businessId, actorUserId, serviceName, durationMinutes, amountSomoni })`.
- Produces: `savePaymentCard({ businessId, actorUserId, recipientCard })`.
- Both throw `OnboardingStepError` codes `INVALID_INPUT`, `FORBIDDEN`, or `ALREADY_COMPLETED`; card save additionally supports `CONFIGURATION_ERROR`.

- [x] **Step 1: Write failing service-command tests**

Cover service values, staff connection, STAFF rejection, cross-tenant rejection, and two repeated submissions yielding exactly one service. Use a serializable transaction and check for an existing tenant service before creation.

- [x] **Step 2: Run service tests and observe failure**

Run: `pnpm vitest run tests/integration/onboarding/create-first-service.test.ts`

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement `createFirstService`**

Validate name 2–120, duration 15–720, and decimal amount producing at least one diram. In one serializable transaction load membership with staff, resolve the oldest branch by `businessId`, check tenant service count, then create and connect the owner staff record. Map a serialization conflict caused by concurrent duplicate submission to `ALREADY_COMPLETED` after confirming that the tenant now has a service.

- [x] **Step 4: Write and run failing card-command tests**

Cover normalization of a spaced 16-digit card, encrypted storage with last four digits, STAFF rejection, cross-tenant branch isolation, and missing encryption configuration.

Run: `pnpm vitest run tests/integration/onboarding/save-payment-card.test.ts`

Expected: FAIL because the module does not exist.

- [x] **Step 5: Implement `savePaymentCard`**

Validate the 16 digits, membership and oldest tenant branch; encrypt with `CARD_ENCRYPTION_KEY` and update only that resolved branch. A branch with an existing encrypted card returns `ALREADY_COMPLETED` rather than overwriting it from the wizard.

- [x] **Step 6: Run both command suites**

Run: `pnpm vitest run tests/integration/onboarding/create-first-service.test.ts tests/integration/onboarding/save-payment-card.test.ts`

Expected: PASS.

### Task 3: Build the resumable three-step wizard

**Files:**
- Modify: `src/app/(dashboard)/dashboard/onboarding/page.tsx`
- Replace: `src/features/onboarding/business-setup-form.tsx`
- Modify: `src/features/onboarding/onboarding-checklist.tsx`
- Create: `src/features/onboarding/onboarding-progress.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/unit/onboarding/registration-pages.test.tsx`
- Modify: `tests/e2e/web-business-onboarding.spec.ts`

**Interfaces:**
- Consumes: `createFirstService` and `savePaymentCard` from Task 2.
- Produces: `OnboardingProgress({ currentStep: 1 | 2 | 3 })`, focused service/card forms, and ready screen.

- [x] **Step 1: Write failing rendering tests**

Assert the progress labels `Услуга`, `Оплата`, `Готово`; assert step 1 contains no card field, step 2 contains no service fields, and step 3 exposes both `/dashboard` and `/dashboard/settings/integrations` actions.

- [x] **Step 2: Write the failing E2E flow**

Register with an eight-character password, submit service details, assert the URL/state shows payment, reload and assert it remains on payment, submit the card, then assert the ready screen and public booking link.

- [x] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run tests/unit/onboarding/registration-pages.test.tsx && pnpm playwright test tests/e2e/web-business-onboarding.spec.ts`

Expected: FAIL because the existing page renders the combined form.

- [x] **Step 4: Implement server-derived routing**

Load the first tenant service and first tenant branch card status. Render step 1 when no service exists, step 2 when service exists without a card, and step 3 when both exist. Each server action catches only known onboarding errors, redirects back with a step-specific error code, and re-derives state after success.

- [x] **Step 5: Implement the interface**

Use one card capped near 680px, persistent labels, short explanatory copy, a three-part progress indicator with current and completed semantics, inline error text, and 48px-minimum buttons. The ready state shows the absolute public booking path derived from the business slug, a primary `Открыть кабинет` link and secondary `Подключить Telegram` link.

- [x] **Step 6: Add responsive and interaction CSS**

Preserve the existing ManClient palette, improve surface hierarchy and spacing on a 4px scale, add hover/pressed/focus-visible states, and collapse progress labels safely at narrow widths without horizontal overflow.

- [x] **Step 7: Run unit and E2E tests**

Run: `pnpm vitest run tests/unit/onboarding/registration-pages.test.tsx && pnpm playwright test tests/e2e/web-business-onboarding.spec.ts`

Expected: PASS on desktop and mobile projects.

### Task 4: Remove the legacy path and release

**Files:**
- Modify any fixtures importing `completeBusinessSetup` discovered by `rg`.
- Modify: `docs/pilot-runbook.md` only if its onboarding instructions describe the combined form.

**Interfaces:**
- Consumes: completed password and wizard behavior.
- Produces: one supported onboarding path with verified production delivery.

- [x] **Step 1: Confirm the legacy API is gone**

Run: `rg -n "completeBusinessSetup|BusinessSetupForm|12 символ|minimum 12" src tests docs`

Expected: no stale implementation or user-facing password requirement; historical design documents may retain dated context.

- [x] **Step 2: Run the complete quality gate**

Run: `pnpm prisma validate && pnpm lint && pnpm typecheck && pnpm test && pnpm build && git diff --check`

Expected: every command exits 0.

- [x] **Step 3: Commit and push**

Stage only the implementation, tests, and relevant runbook. Commit with `feat: add progressive business onboarding`, push `main`, and verify `git ls-remote origin refs/heads/main` matches local HEAD.

- [x] **Step 4: Verify production**

Require the Coolify deployment record to be `finished` for the exact commit, the container image tag to match that SHA and report healthy, `/api/health` to return 200, and `/dashboard/onboarding` to redirect unauthenticated visitors to login. Verify the public registration HTML contains the eight-character requirement.
