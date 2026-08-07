# Payment Status and Review Implementation Plan

> **Статус на 2026-08-07: реализовано.** Сверено с кодом; `pnpm lint`, `pnpm typecheck` и `pnpm vitest run tests/unit tests/integration` (113 файлов, 474 теста) проходят.

**Goal:** Клиент после создания записи всегда попадает на восстанавливаемую страницу оплаты, может отправить чек из web и увидеть итог, а бизнес получает безопасную очередь ручной проверки.

**Architecture:** Публичный доступ к payment идёт только через подписанный action token. Upload сохраняет оригинал в private S3, немедленно возвращает понятный processing state и использует общий OCR/confirmation service. Review commands повторно проверяют OWNER/ADMIN membership и tenant. Изображение отдаётся только через authenticated streaming endpoint; bucket не становится публичным.

## Task 1: Payment review state and domain boundary

- Extend Payment with review reason, reviewedAt/reviewedBy and rejected state; additive migration.
- Add tenant-aware payment query/decision service and stable errors.
- Approve confirms booking without declaring bank verification; reject keeps history and records reason.
- Test duplicate operation, cross-tenant access, idempotency and audit.

## Task 2: Durable public payment status

- Create `/payment/[token]` with payment, booking, expiry and safe business summary.
- Return this signed path from booking creation and persist it in client flow across bank return.
- Add status JSON endpoint with no raw payment ID authorization.
- Poll only while pending/processing; stop on accepted, attention, rejected or expiry.

## Task 3: Web receipt upload

- Add multipart upload endpoint: JPEG/PNG/WebP only, 10 MB maximum, decoded image validation and randomized tenant storage key.
- Reuse private receipt storage and DushanbeCity recognizer; never trust filename/content type alone.
- UI shows immediate upload progress, OCR expectation, retry and final status.
- Audit receipt received and recognition failure without logging image/card data.

## Task 4: Business review inbox

- Add `Проверка чеков` dashboard route and navigation badge/count.
- List expected/recognized amount, recipient suffix, operation number/date and mismatch reason.
- Detail includes authenticated receipt preview, booking/customer context and audit.
- OWNER/ADMIN can approve or reject with reason; STAFF cannot access route or media.

## Task 5: Integrate booking surfaces

- Booking detail links payment attention state to review item.
- Overview attention metric opens review inbox, not generic pending bookings.
- Public booking transitions to durable status page instead of fragile inline Telegram-only instructions.

## Task 6: Release gate

- Unit/integration tests for token status, upload validation, review decisions and tenant isolation.
- E2E: web booking -> payment page -> mocked upload -> accepted/attention; admin review approve/reject; STAFF denial; 320–1440 responsive.
- Full tests, lint, typecheck, build and runbook update.
- No push/deploy without explicit permission.
