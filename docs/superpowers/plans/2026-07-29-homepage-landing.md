# ManClient Homepage Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Статус на 2026-08-07: реализовано.** Сверено с кодом; `pnpm lint`, `pnpm typecheck` и `pnpm vitest run tests/unit tests/integration` (113 файлов, 474 теста) проходят.

**Goal:** Replace the root placeholder with a responsive Russian B2B landing page that explains ManClient and routes owners to onboarding or sign-in.

**Architecture:** Keep `src/app/page.tsx` as a thin runtime environment adapter and render a focused server component from `src/features/marketing/homepage.tsx`. The component receives a validated optional Telegram onboarding URL, so its configured and fallback states are deterministic and testable without network or database access. Extend the existing CSS token system and metadata without adding a frontend dependency.

**Tech Stack:** Next.js 16 App Router, React 19 server components, TypeScript, CSS, Vitest, React server rendering, Playwright, Docker, Coolify.

## Global Constraints

- Keep customer booking at `/b/{businessSlug}`, authentication at `/login`, and the workspace at `/dashboard` unchanged.
- Use plain Russian and do not invent customers, metrics, testimonials, prices, integrations, or certifications.
- Payment copy must state that DushanbeCity transfers money directly to the business.
- Telegram and WhatsApp copy must distinguish current product roles without claiming production credentials are configured.
- All controls must work; missing onboarding configuration must show an honest fallback instead of a dead link.
- Preserve WCAG AA contrast, visible focus, 44 px practical mobile targets, 320 px layout support, and reduced-motion behavior.
- Reuse existing green design tokens and avoid a parallel component framework or fake dashboard imagery.

---

### Task 1: Onboarding link contract and homepage content

**Files:**
- Create: `src/features/marketing/homepage.tsx`
- Create: `tests/unit/marketing/homepage.test.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Produces: `normalizeTelegramOnboardingUrl(value: string | undefined): string | null` accepts only `https://t.me/...` or `https://telegram.me/...` URLs.
- Produces: `MarketingHomePage({ onboardingUrl }: { onboardingUrl: string | null }): ReactElement` renders the complete landing and both CTA states.
- Consumes: `process.env.NEXT_PUBLIC_ONBOARDING_TELEGRAM_URL` in the root page only.

- [x] **Step 1: Write failing component and URL-contract tests**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { MarketingHomePage, normalizeTelegramOnboardingUrl } from "@/features/marketing/homepage";

describe("ManClient homepage", () => {
  test("explains the B2B product and links owners to login", () => {
    const html = renderToStaticMarkup(<MarketingHomePage onboardingUrl="https://t.me/manclient_bot" />);
    expect(html).toContain("Принимайте записи, пока занимаетесь бизнесом");
    expect(html).toContain('href="/login"');
    expect(html).toContain("Деньги поступают напрямую вашему бизнесу");
    expect(html).not.toContain("Запись подтверждена");
  });

  test("renders Telegram onboarding only for a safe configured URL", () => {
    expect(normalizeTelegramOnboardingUrl("https://t.me/manclient_bot")).toBe("https://t.me/manclient_bot");
    expect(normalizeTelegramOnboardingUrl("javascript:alert(1)")).toBeNull();
    expect(renderToStaticMarkup(<MarketingHomePage onboardingUrl={null} />)).toContain("Подключаем первые бизнесы вручную");
  });
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `pnpm test tests/unit/marketing/homepage.test.tsx`

Expected: FAIL because `@/features/marketing/homepage` does not exist.

- [x] **Step 3: Implement the server component and thin root adapter**

Implement semantic `header`, `main`, seven sections, and `footer`; use real product flow copy and working anchor links. Export `dynamic = "force-dynamic"` from `src/app/page.tsx` so the onboarding URL is evaluated at runtime rather than baked into the image.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm test tests/unit/marketing/homepage.test.tsx`

Expected: 2 tests pass.

- [x] **Step 5: Commit the content contract**

```bash
git add src/app/page.tsx src/features/marketing/homepage.tsx tests/unit/marketing/homepage.test.tsx
git commit -m "feat: add ManClient B2B homepage"
```

### Task 2: Responsive visual system and metadata

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Modify: `tests/unit/marketing/homepage.test.tsx`

**Interfaces:**
- Consumes: the semantic class names defined by `MarketingHomePage`.
- Produces: root metadata for title, description, Open Graph, and Twitter summary.

- [x] **Step 1: Extend the failing test with metadata and structural assertions**

Assert that the rendered markup contains `aria-label="Основная навигация"`, the `#how-it-works` anchor target, the final CTA, and no inactive buttons. Import `metadata` from `src/app/layout.tsx` and assert the title and description identify online booking for service businesses.

- [x] **Step 2: Run the focused test and verify RED**

Run: `pnpm test tests/unit/marketing/homepage.test.tsx`

Expected: FAIL on missing metadata/structure assertions.

- [x] **Step 3: Implement styles and metadata**

Add landing-specific classes under a `.marketing-page` namespace. Use an offset two-column hero, a real booking-flow explanation, varied sections instead of repeated identical cards, mobile navigation wrapping, 44 px actions, visible focus, and `prefers-reduced-motion`. Update metadata to `ManClient - онлайн-запись для сервисного бизнеса` with an accurate Russian description and matching Open Graph/Twitter values.

- [x] **Step 4: Run focused and full static verification**

Run:

```bash
pnpm test tests/unit/marketing/homepage.test.tsx
pnpm lint
pnpm typecheck
pnpm test
DATABASE_URL='postgresql://manclient:manclient@127.0.0.1:5432/manclient' \
AUTH_SECRET='local-auth-secret-at-least-32-characters' \
APP_URL='http://127.0.0.1:3000' AUTH_URL='http://127.0.0.1:3000' \
CARD_ENCRYPTION_KEY='BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=' \
INTERNAL_API_SECRET='local-internal-secret-at-least-32-characters' \
BOOKING_ACTION_SECRET='local-booking-secret-at-least-32-characters' pnpm build
```

Expected: lint/typecheck/build exit 0 and all tests pass.

- [x] **Step 5: Commit the visual implementation**

```bash
git add src/app/globals.css src/app/layout.tsx tests/unit/marketing/homepage.test.tsx
git commit -m "style: finish responsive ManClient landing"
```

### Task 3: Rendered QA, publication, and production verification

**Files:**
- Modify only if QA finds a landing regression: `src/features/marketing/homepage.tsx`, `src/app/globals.css`, or tests proving that regression.
- Keep screenshots and temporary browser scripts outside the repository.

**Interfaces:**
- Consumes: `/`, `/login`, `/api/health`, and the committed landing component.
- Produces: a verified GitHub SHA and a matching successful Coolify deployment.

- [x] **Step 1: Run local Playwright QA because the Browser plugin is unavailable**

Target flow: `/` loads -> B2B hero renders -> sign-in action navigates to `/login` -> mobile layout has no horizontal overflow.

Use Chromium at 1440x1000 and 390x844. Check title, hero, no framework overlay, console errors/warnings, focus visibility, `/login` navigation, horizontal overflow, and capture screenshots under `/tmp`.

- [x] **Step 2: Fix any rendered regression with a failing test first**

For each defect, add the smallest component assertion or Playwright check that fails, apply the focused fix, then repeat Step 1.

- [x] **Step 3: Run final verification and inspect scope**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, then `git diff --check`, `git status --short`, and `git log -3 --oneline`.

Expected: all commands pass; only the landing/spec/plan scope is present.

- [x] **Step 4: Push `main` and verify GitHub identity**

```bash
git push origin main
test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/main | cut -f1)"
```

- [x] **Step 5: Observe the auto-deploy and verify production**

Use the Vault-backed Coolify API. Require deployment `finished`, application `running:healthy`, deployment/app/GitHub SHA equality, `/api/health` HTTP 200, `/` HTTP 200 with the new hero heading, and desktop/mobile browser smoke against `https://manclient.mubi.dev`.
