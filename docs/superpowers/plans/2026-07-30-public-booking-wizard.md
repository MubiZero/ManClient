# Public Booking Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Статус на 2026-08-07: реализовано.** Сверено с кодом; `pnpm lint`, `pnpm typecheck` и `pnpm vitest run tests/unit tests/integration` (113 файлов, 474 теста) проходят.

**Goal:** Make the public booking route a recoverable, timezone-correct stepper that a customer can complete confidently on a phone.

**Architecture:** Keep booking creation and availability in the existing API/domain services. The client form owns only presentation state: explicit current step, selected values, client-side phone feedback, and cancellation of stale availability requests. The server page passes each branch timezone with its published services.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Playwright, existing CSS tokens and Tajik phone formatter.

## Global Constraints

- Preserve `businessId` scope and the existing booking API contract.
- Do not change payment provider handling, data models, migrations, Telegram, or production configuration.
- Russian public copy, branch-local dates/times, 44px touch controls, visible keyboard focus and reduced-motion support.
- Follow test-first implementation and verify focused unit, browser, lint, typecheck, full test suite and production build.

---

### Task 1: Pass branch timezone through the public booking projection

**Files:**
- Modify: `src/app/b/[businessSlug]/page.tsx`
- Modify: `src/features/public-booking/booking-form.tsx`
- Test: `tests/unit/public-booking/booking-form.test.tsx`

**Interfaces:**
- `Branch` gains `timeZone: string`.
- Slot labels and minimum date are calculated from the selected branch timezone, not the browser UTC date.

- [x] **Step 1: Write a failing timezone regression test**

Render a branch in `Europe/Berlin` with a UTC slot and assert the visible time is Berlin local time, proving the component consumes `branch.timeZone`.

- [x] **Step 2: Run the focused test**

Run: `pnpm test -- tests/unit/public-booking/booking-form.test.tsx`

Expected: FAIL because the branch type does not expose a timezone and the formatter is hard-coded to Asia/Dushanbe.

- [x] **Step 3: Extend the server projection and formatter**

Select `timeZone` with each branch, derive the minimum local date with `todayInTimeZone`, and format time slots using the selected branch timezone.

- [x] **Step 4: Re-run the focused test**

Run: `pnpm test -- tests/unit/public-booking/booking-form.test.tsx`

Expected: PASS.

### Task 2: Add recoverable wizard navigation and phone feedback

**Files:**
- Modify: `src/features/public-booking/booking-form.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/unit/public-booking/booking-form.test.tsx`

**Interfaces:**
- The form displays a progress indicator and a current selection summary.
- Later selections expose a `Назад` action that clears only dependent state.
- Phone input reuses `formatTajikPhoneInput` and `normalizeTajikPhone`.

- [x] **Step 1: Write failing tests for current step and invalid phone recovery**

Assert the initial markup explains the first action, a selected time exposes `Назад к выбору времени`, and an invalid phone gets a labelled inline error after blur.

- [x] **Step 2: Run the focused test**

Run: `pnpm test -- tests/unit/public-booking/booking-form.test.tsx`

Expected: FAIL because the existing form exposes all accumulated sections without progress/back controls or phone feedback.

- [x] **Step 3: Implement small state transitions**

Add a `BookingProgress` presentation helper in the form, reset dependent choices on backward actions, format phone on input, validate only on blur and submit, and send the normalized phone in the existing request body.

- [x] **Step 4: Add concise responsive styles**

Add an accessible progress bar, a saved-selection summary and quiet back controls using existing CSS variables. Do not introduce a separate design system.

- [x] **Step 5: Re-run the focused test**

Run: `pnpm test -- tests/unit/public-booking/booking-form.test.tsx`

Expected: PASS.

### Task 3: Prevent stale availability responses from changing the selected day

**Files:**
- Modify: `src/features/public-booking/booking-form.tsx`
- Modify: `tests/e2e/public-booking.spec.ts`

**Interfaces:**
- Each availability request has an `AbortController`; only the current request can update slots, loading or error state.

- [x] **Step 1: Extend the browser flow**

Use the public form to pick a date and slot through the visible wizard controls; assert the booking route completes with the formatted phone value.

- [x] **Step 2: Implement current-request protection**

Abort an earlier request before starting a later request, ignore an aborted or superseded response, and abort the active request during unmount.

- [x] **Step 3: Run the browser regression**

Run: `pnpm playwright test tests/e2e/public-booking.spec.ts --project=chromium`

Expected: PASS.

### Task 4: Complete verification

**Files:**
- Verify only.

- [x] **Step 1: Run static checks and full tests**

Run: `pnpm lint && pnpm typecheck && pnpm test`

- [x] **Step 2: Run browser regression and build**

Run: `pnpm playwright test tests/e2e/public-booking.spec.ts tests/e2e/booking-operations.spec.ts --project=chromium && pnpm build`

- [x] **Step 3: Inspect scoped diff and commit**

Run: `git diff --check && git status --short`
