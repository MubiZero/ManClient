# ManClient homepage landing design

## Decision

Replace the placeholder at `/` with a Russian-language B2B landing page for owners of salons, barbershops, auto services, and other appointment-based businesses in Tajikistan.

The homepage sells and explains ManClient. Customer booking remains under `/b/{businessSlug}`. The authenticated workspace remains under `/dashboard`, with `/login` as its entry point.

## Alternatives considered

1. **B2B landing page (selected).** Gives an unfamiliar visitor enough context to understand the product and provides paths to sign in or request onboarding.
2. **Immediate redirect to `/login`.** Smaller implementation, but unsuitable for business owners who do not yet know the product or have an account.
3. **Customer business directory.** Could become useful later, but conflicts with the current tenant-owned booking-link model and is outside the MVP.

## Design direction

Design read: a trustworthy, locally relevant SaaS landing page for a busy service-business owner, using the existing calm green ManClient system rather than introducing a separate visual language.

- Design variance: 5/10, an offset hero and varied section layouts without experimental navigation.
- Motion intensity: 3/10, only immediate hover, focus, press, and a restrained hero entrance; reduced-motion remains supported.
- Visual density: 4/10, enough space to scan quickly on a phone while retaining concrete product detail.
- Aesthetic: operational clarity inspired by a well-kept appointment book and front desk, not a generic purple-gradient SaaS template.
- Existing tokens, radii, focus treatment, and Russian terminology remain the source of truth.

## Conversion goal and navigation

The primary conversion is **«Подключить бизнес»**. In the MVP it opens a prefilled Telegram contact link for manual onboarding. If the Telegram contact is not configured, the action becomes a non-deceptive contact instruction rather than a dead button.

The secondary action is **«Войти»**, linking to `/login`.

Header navigation uses anchors to the relevant page sections and retains the two conversion actions. Customer booking is not presented as a generic search because customers should follow the business-specific link they receive.

## Page structure

1. **Header:** ManClient wordmark, short section navigation, sign-in link, onboarding CTA.
2. **Hero:** outcome-led heading about accepting appointments without calls and chat confusion; one supporting sentence naming the target businesses and Tajikistan; primary and secondary actions.
3. **Product proof:** a real representation of the existing booking flow using actual product copy and states, not invented metrics or fake customer logos.
4. **How it works:** three concise steps: business configures services and staff, shares its link, receives paid confirmed bookings.
5. **Channel and payment section:** Telegram as the primary interactive channel, WhatsApp for notifications, and direct DushanbeCity payment to the business.
6. **Business types:** concrete examples for salons, barbershops, auto services, and bookable resources such as a master or service bay.
7. **Final CTA:** repeat onboarding action and sign-in path without adding a pricing claim that has not been decided.
8. **Footer:** product name, geography, privacy/support placeholders only when backed by real routes or contact details.

## Content rules

- Plain Russian, short sentences, and domain terms familiar to business owners.
- No invented adoption numbers, testimonials, customer logos, prices, or security certifications.
- No claims that Telegram or WhatsApp are active until their production credentials are configured.
- DushanbeCity copy explicitly says payment goes directly to the business.
- No misleading action: every control has a working target or is omitted.
- Tajik localization is not faked with copied Russian text; it remains a separate follow-up until complete translations exist.

## Responsive and accessibility behavior

- One-column flow on narrow screens; no horizontal scrolling at 320 CSS px.
- Interactive targets are at least 44 px high for the practical mobile baseline.
- Visible `:focus-visible` treatment and semantic landmarks/headings.
- Text and UI contrast meet WCAG AA; body copy stays within a readable measure.
- Navigation collapses without hiding either onboarding or sign-in access.
- Motion uses transform/opacity only and respects `prefers-reduced-motion`.

## Technical boundaries

- Implement the page as focused React server components where separation improves readability; avoid a single oversized component and avoid needless component files.
- Extend the existing global token system instead of adding a UI framework or a parallel theme.
- Keep `/b/{businessSlug}`, `/login`, `/dashboard`, APIs, data model, authentication, and booking behavior unchanged.
- Update root metadata and social metadata to describe the B2B product accurately.
- The onboarding contact target is supplied through a public environment variable, not hardcoded personal data.

## States and failure handling

- The static landing page has no loading dependency on PostgreSQL or third-party APIs.
- Missing onboarding contact configuration produces an honest text fallback and preserves the login path.
- Broken or absent visual assets must not collapse the hero; initial delivery can use typography and CSS composition instead of remote images.

## Verification

- Component tests cover the B2B value proposition, working `/login` link, onboarding configured/unconfigured behavior, and absence of the old confirmation placeholder.
- Run lint, typecheck, unit/integration tests, and production build.
- Browser smoke at desktop and mobile widths checks layout, focus order, action targets, console errors, and no horizontal overflow.
- After deployment, verify the deployed SHA, Coolify `running:healthy`, `/api/health` 200, and `/` 200 with the new heading visible.
