# Onboarding Launch Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Статус на 2026-08-07: реализовано.** Сверено с кодом; `pnpm lint`, `pnpm typecheck` и `pnpm vitest run tests/unit tests/integration` (113 файлов, 474 теста) проходят.

**Goal:** Replace the contradictory final onboarding checklist with a clear launch result, an explained customer link, and a separate optional Telegram channel.

**Architecture:** Keep readiness calculation on the server page and turn the final summary into a focused server component plus a small client component responsible only for copying the absolute booking URL. Reuse the existing public booking and integrations routes; no database or API changes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS, Vitest, Playwright.

## Global Constraints

- The base launch remains complete when service, staff, and schedule are ready; Telegram is optional.
- The progress labels are exactly `Услуга`, `Оплата`, `Запуск`.
- The public route remains `/b/{businessSlug}`.
- Do not add analytics, Web Share API, QR codes, dependencies, or new server endpoints.
- Clipboard success and failure feedback must use `aria-live`.
- Desktop and 390px mobile layouts must not overflow.

---

### Task 1: Launch summary component and copy action

**Files:**
- Create: `src/features/onboarding/booking-link-actions.tsx`
- Modify: `src/features/onboarding/onboarding-checklist.tsx`
- Modify: `src/features/onboarding/onboarding-progress.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/unit/onboarding/registration-pages.test.tsx`

**Interfaces:**
- Consumes: `businessSlug: string`, readiness with `telegram: boolean`, browser `navigator.clipboard.writeText`.
- Produces: `BookingLinkActions({ bookingPath }: { bookingPath: string })` and the revised `OnboardingChecklist` UI.

- [x] **Step 1: Write failing component tests**

Add assertions that the final summary renders `Страница записи работает`, `Ссылка для клиентов`, explanatory distribution copy, `Открыть страницу`, `Скопировать ссылку`, and a separate `Добавьте запись через Telegram` block when `telegram` is false. Assert the old five-row readiness list, `Открыть кабинет`, `К каналам`, and `Ваша ссылка для записи` are absent. Add the connected case asserting `Telegram подключён` and `Открыть интеграции`.

- [x] **Step 2: Run the component test and confirm RED**

Run: `pnpm vitest run tests/unit/onboarding/registration-pages.test.tsx`

Expected: failure because the new launch copy and controls do not exist.

- [x] **Step 3: Implement the minimal component structure**

Change the third progress label to `Запуск`. Replace the mixed readiness list with:

```tsx
<p className="step-kicker">Запись запущена</p>
<h2>Страница записи работает</h2>
<BookingLinkActions bookingPath={`/b/${businessSlug}`} />
<section className="onboarding-channel-card">...</section>
```

The disconnected channel links to `/dashboard/settings/integrations` with `Создать клиентского бота`; the connected channel renders `Telegram подключён` and `Открыть интеграции`.

- [x] **Step 4: Implement clipboard behavior**

`BookingLinkActions` computes the absolute URL from `window.location.origin + bookingPath`, calls `navigator.clipboard.writeText`, and sets an `aria-live="polite"` status to `Ссылка скопирована`. On rejection it sets `Не удалось скопировать. Выделите ссылку вручную.` The booking path remains visible and selectable.

- [x] **Step 5: Style the new hierarchy and responsive actions**

Use existing brand/surface tokens. Keep the launch result visually positive, make the customer link the primary block, and render the optional Telegram block with neutral styling rather than an error state. At the existing mobile breakpoint, stack link actions vertically and keep every action at least 44px high.

- [x] **Step 6: Run component tests and confirm GREEN**

Run: `pnpm vitest run tests/unit/onboarding/registration-pages.test.tsx`

Expected: all tests pass.

- [x] **Step 7: Commit the component slice**

```bash
git add src/features/onboarding/booking-link-actions.tsx src/features/onboarding/onboarding-checklist.tsx src/features/onboarding/onboarding-progress.tsx src/app/globals.css tests/unit/onboarding/registration-pages.test.tsx
git commit -m "feat: clarify onboarding launch summary"
```

### Task 2: Browser flow and visual verification

**Files:**
- Modify: `tests/e2e/web-business-onboarding.spec.ts`

**Interfaces:**
- Consumes: final onboarding screen from Task 1.
- Produces: browser regression coverage for launch copy, public page opening, optional Telegram, and responsive layout.

- [x] **Step 1: Write failing E2E expectations**

After payment setup, assert the heading `Страница записи работает`, the explanatory customer-link block, a public booking link whose `href` matches `/b/`, and the separate `Создать клиентского бота` action. Assert the final progress label is `Запуск` and no incomplete row appears inside the completed progress.

- [x] **Step 2: Run E2E and confirm RED if Task 1 is reverted**

Run: `pnpm exec playwright test tests/e2e/web-business-onboarding.spec.ts`

Expected against the pre-Task-1 UI: failure on the new heading or action. Expected after Task 1: pass.

- [x] **Step 3: Add interaction proof for the public link**

Use a popup-safe check by asserting the visible `Открыть страницу` link has the exact public `href`; navigate to it in the same page and assert the public business heading renders. Do not mock routing.

- [x] **Step 4: Verify desktop and mobile rendering**

Run the flow at the default desktop viewport, then set `390x844`. Assert `.onboarding-launch-actions` fits within the viewport and both actions remain visible. Capture temporary screenshots outside the repository and check the browser console for errors.

- [x] **Step 5: Run final gates**

```bash
pnpm lint
pnpm typecheck
pnpm vitest run tests/unit/onboarding/registration-pages.test.tsx
pnpm exec playwright test tests/e2e/web-business-onboarding.spec.ts
pnpm build
```

Expected: all commands exit 0; browser console has no relevant errors.

- [x] **Step 6: Commit the browser coverage**

```bash
git add tests/e2e/web-business-onboarding.spec.ts
git commit -m "test: cover onboarding launch summary"
```
