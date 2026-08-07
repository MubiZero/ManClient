# Web Business Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Статус на 2026-08-07: реализовано.** Сверено с кодом; `pnpm lint`, `pnpm typecheck` и `pnpm vitest run tests/unit tests/integration` (113 файлов, 474 теста) проходят.

**Goal:** Убрать круговой переход сайт -> Telegram -> сайт и дать новому владельцу самостоятельную web-регистрацию бизнеса.

**Architecture:** Core registration service валидирует данные и атомарно создаёт tenant graph. Server Action выполняет регистрацию и вход. Landing использует обычные внутренние ссылки, а onboarding показывает следующие действия в кабинете.

**Tech Stack:** Next.js App Router, Auth.js, Prisma/PostgreSQL, React 19, Zod, Vitest, Playwright.

## Global Constraints

- Telegram не является обязательным шагом регистрации бизнеса.
- Пароли и секреты никогда не логируются и не возвращаются.
- Все tenant entities создаются одной transaction.
- Реализация следует TDD: RED перед production code.

---

### Task 1: Atomic business registration

**Files:**
- Create: `src/core/onboarding/register-business.ts`
- Create: `tests/integration/onboarding/register-business.test.ts`

**Interfaces:**
- Produces: `registerBusiness(input): Promise<{ userId: string; businessId: string }>`.

- [x] Write tests for successful tenant graph, normalized email and duplicate rejection.
- [x] Run focused test and confirm RED because module is missing.
- [x] Implement Zod validation, slug allocation, password hashing and Prisma transaction.
- [x] Run focused test and confirm GREEN.

### Task 2: Registration and onboarding UI

**Files:**
- Create: `src/app/register/page.tsx`
- Create: `src/app/(dashboard)/dashboard/onboarding/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/login/page.tsx`
- Test: `tests/unit/onboarding/registration-pages.test.tsx`

**Interfaces:**
- Consumes: `registerBusiness(input)`.

- [x] Write render assertions for persistent labels, password hint, login/register cross-links and real next-step links.
- [x] Run test and confirm RED.
- [x] Implement Server Action registration, automatic credentials sign-in and responsive onboarding page.
- [x] Run test, typecheck and lint.

### Task 3: Remove Telegram marketing handoff

**Files:**
- Modify: `src/features/marketing/homepage.tsx`
- Modify: `src/app/page.tsx`
- Modify: `tests/unit/marketing/homepage.test.tsx`
- Create: `tests/e2e/web-business-onboarding.spec.ts`

**Interfaces:**
- Landing CTA is always internal `/register` and never reads Telegram environment.

- [x] Change the existing marketing test first to require `/register` and reject `t.me`.
- [x] Run it and confirm RED.
- [x] Remove Telegram URL normalization and replace CTA anchors with Next links.
- [x] Add E2E landing -> register -> onboarding coverage and mobile check.
- [x] Run complete release gate, commit, push and deploy exact SHA.
