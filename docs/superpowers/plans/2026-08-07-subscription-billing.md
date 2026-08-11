# Subscription Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Статус на 2026-08-11: реализовано.** Сверено с кодом; `pnpm prisma validate`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (120 файлов, 536 тестов), `pnpm build` и браузерный сюит (28 сценариев) проходят.
>
> Расхождения с планом, сделанные осознанно:
> - `src/env.ts` в проекте нет — переменные читаются по месту использования с локальной валидацией, как в `payom-client.ts`. `PLATFORM_PAYMENT_CARD` живёт в `src/core/platform/platform-payment-card.ts` и описана в `.env.example` и runbook.
> - Экран прайса несёт четыре поля, а не шесть: `START` бесплатен, и Task 4 сам запрещает ему цену.
> - Task 5 потребовал модель `SubscriptionReceipt` и аддитивную миграцию, которых не было в списке файлов: клиентский `ReceiptSubmission` привязан к `Payment` брони и для счёта не годится.
> - У чека за подписку нет статуса `FAILED` с ретраями: нечитаемый чек сразу уходит к оператору, поэтому второй фоновой задачи не появилось.
> - `AuditEvent.businessId` стал nullable: цена тарифа не принадлежит ни одному бизнесу. `writeAuditEvent` по-прежнему требует бизнес, опустить его умеет только `writePlatformAuditEvent`.
> - Сверх плана: ручной срок в бэкофисе (`Тариф → Оплачено по`), без которого документировать «как выдать срок вручную» было бы нечего.

**Goal:** Дать подписке срок, статус и способ её оплатить, не сломав ни один существующий бизнес и не отобрав у клиентов салона доступ к записи из-за долга салона.

**Architecture:** Право на тариф хранится в `Business`, действующий тариф вычисляется из статуса и срока. Оплата подписки переиспользует существующие хранилище чеков, OCR-распознаватель и генератор ссылки DushanbeCity; проверка живёт в платформенном бэкофисе. Переходы статусов делает задача общего планировщика.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma 7, PostgreSQL, Zod, Vitest, Playwright.

## Global Constraints

- Существующие бизнесы после миграции работают ровно как раньше: `subscriptionEndsAt = null`, статус `ACTIVE`, ничего не выключается.
- `EXPIRED` гасит только платные функции. Записи, клиенты, история и публичная страница `/b/<slug>` продолжают работать всегда.
- Ни один вызов не получает голый `subscriptionPlan`: компилятор обязан найти каждое место.
- Чек подтверждает оплату, но не называется банковски верифицированным.
- Номер карты платформы не попадает ни в базу, ни в git, ни в логи.
- Каждое поведение покрывается тестом до реализации.

---

### Task 1: Срок и статус подписки в модели

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260807070522_subscription_lifecycle/migration.sql`
- Create: `src/core/platform/subscription-lifecycle.ts`
- Create: `tests/unit/platform/subscription-lifecycle.test.ts`

**Interfaces:**
- Produces: `effectivePlan(subscription)`, `nextSubscriptionStatus(subscription, now)`, `extendPeriod(currentEndsAt, period, now)`, `startTrial(now)`.

- [x] **Step 1: Написать падающие тесты на вычисление действующего тарифа и переходов**

`TRIALING` и `ACTIVE` отдают проданный тариф; `GRACE` тоже (grace ничего не отбирает); `EXPIRED` отдаёт `START`. `subscriptionEndsAt = null` никогда не истекает. Продление от большей из дат: оплата за 10 дней до конца периода добавляет период к концу, а не к сегодня.

- [x] **Step 2: Запустить тест и убедиться, что модуля нет**

Run: `pnpm vitest run tests/unit/platform/subscription-lifecycle.test.ts`

- [x] **Step 3: Добавить enum'ы и поля в схему, миграция аддитивная**

`SubscriptionStatus`, `BillingPeriod`; `Business.subscriptionStatus` со значением по умолчанию `ACTIVE` и `subscriptionEndsAt` nullable. Отдельного `trialEndsAt` нет: триал — это статус `TRIALING` и та же дата окончания. Дефолты обязаны воспроизводить поведение до биллинга.

- [x] **Step 4: Реализовать чистые функции жизненного цикла без обращения к базе**

- [x] **Step 5: Перезапустить тест и прогнать `pnpm prisma validate`**

### Task 2: Право проверяется через статус, а не через enum

**Files:**
- Modify: `src/core/platform/subscription-plans.ts`
- Modify: все 14 вызывающих файлов, которые перечислит `pnpm typecheck`
- Modify: `tests/unit/platform/subscription-plans.test.ts`

**Interfaces:**
- Consumes: `{ subscriptionPlan, subscriptionStatus, subscriptionEndsAt }`.
- Produces: `businessHasFeature(subscription, feature)`, `requirePlanFeature(subscription, feature)`.

- [x] **Step 1: Написать падающий тест: просроченный PREMIUM не имеет ни одной платной функции**

Отдельно проверить, что `GRACE` их сохраняет, а `TRIALING` даёт полный PREMIUM.

- [x] **Step 2: Запустить тест и убедиться в падении**

- [x] **Step 3: Сменить сигнатуру на объект подписки**

Голый enum больше не принимается — это и есть механизм поиска пропущенных мест.

- [x] **Step 4: Прогнать `pnpm typecheck` и перевести каждое место из списка ошибок**

Запросы Prisma в этих местах должны выбирать три поля вместо одного. Ни одно место не «чинится» приведением типа.

- [x] **Step 5: Прогнать `pnpm typecheck` и весь `pnpm test`**

Полный сюит здесь обязателен: задача трогает гейты SMS, отзывов, промокодов, комиссий, листа ожидания и повторяющихся записей.

### Task 3: Триал новым бизнесам

**Files:**
- Modify: `src/core/onboarding/register-business.ts`
- Modify: `tests/integration/onboarding/register-business.test.ts`

- [x] **Step 1: Написать падающий тест: новый бизнес получает PREMIUM, `TRIALING` и срок +14 дней**

- [x] **Step 2: Запустить тест и убедиться в падении**

- [x] **Step 3: Проставить триал в той же транзакции, что создаёт бизнес**

Длина триала — именованная константа, а не литерал в трёх местах.

- [x] **Step 4: Перезапустить тест**

### Task 4: Счёт за подписку и ссылка на оплату

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_subscription_invoices/migration.sql`
- Create: `src/core/platform/plan-pricing.ts`
- Create: `src/core/platform/subscription-invoice-service.ts`
- Create: `src/app/(platform)/platform/plans/page.tsx`
- Modify: `src/env.ts`
- Modify: `.env.example`
- Create: `tests/integration/platform/plan-pricing.test.ts`
- Create: `tests/integration/platform/subscription-invoice.test.ts`

**Interfaces:**
- Consumes: `createPaymentUrl` из `src/integrations/dushanbe-city/payment-link.ts`.
- Produces: `listPlanPrices`, `setPlanPrice`, `createSubscriptionInvoice`, `getOpenInvoice`, `listInvoices`.

- [x] **Step 1: Написать падающие тесты на прайс**

Цена задаётся парой тариф+период и перезаписывается, а не дублируется; отрицательная и нулевая цена отклоняются; `START` в прайс не принимается; изменить цену может только админ платформы; каждое изменение попадает в аудит.

- [x] **Step 2: Запустить тест и убедиться в падении**

- [x] **Step 3: Добавить модели `PlanPrice` и `SubscriptionInvoice` и аддитивную миграцию**

`PlanPrice` уникален по `[plan, period]`. `SubscriptionInvoice` хранит `amountDiram` слепком, а не ссылкой на прайс.

- [x] **Step 4: Реализовать чтение и запись прайса**

- [x] **Step 5: Написать падающие тесты на выставление счёта**

Сумма копируется из прайса в счёт; изменение прайса после выставления не меняет уже выставленный счёт; тариф без цены не предлагается и счётом не выставляется; `START` счётом не выставляется; второй открытый счёт не создаётся, а возвращается существующий; ссылка на оплату содержит карту платформы, сумму и номер счёта.

- [x] **Step 6: Добавить `PLATFORM_PAYMENT_CARD` в валидируемое окружение**

Переменная опциональна: пока она пуста, самостоятельная оплата не предлагается, а кабинет честно говорит, что оплату принимает оператор. Это же делает существующий `/reset-password` без шаблона payom.

- [x] **Step 7: Реализовать сервис счетов**

- [x] **Step 8: Собрать экран прайса в платформенном бэкофисе**

Шесть полей, текущая цена и кто менял последним. Пустая цена означает «тариф не продаётся», и экран говорит это словами, а не пустым полем.

- [x] **Step 9: Перезапустить тесты**

### Task 5: Загрузка чека и проверка платформой

**Files:**
- Create: `src/app/api/dashboard/subscription/receipt/route.ts`
- Create: `src/core/platform/subscription-receipt-service.ts`
- Create: `src/app/(platform)/platform/subscriptions/page.tsx`
- Create: `tests/integration/platform/subscription-receipt.test.ts`

**Interfaces:**
- Consumes: `storeReceipt`, `getReceipt`, `recognizeDushanbeCityReceipt`.
- Produces: автоподтверждение по пяти совпадениям, очередь `NEEDS_ATTENTION`, решения админа платформы.

- [x] **Step 1: Написать падающие тесты на приём и разбор чека**

Пять совпадений продлевают подписку и переводят счёт в `PAID`; расхождение суммы уводит в `NEEDS_ATTENTION`; повторно использованный номер операции отклоняется; чужой бизнес не видит счёт; не-админ платформы не открывает очередь и не получает изображение.

- [x] **Step 2: Запустить тест и убедиться в падении**

- [x] **Step 3: Реализовать приём файла теми же ограничениями, что и чеки клиентов**

JPEG/PNG/WebP, 10 МБ, проверка декодированием, случайный ключ хранения. Имени файла и заявленному типу не верить.

- [x] **Step 4: Реализовать сверку и продление периода**

Продление идёт через `extendPeriod` из Task 1, а не собственной арифметикой дат.

- [x] **Step 5: Собрать очередь проверки в платформенном бэкофисе**

Утвердить/отклонить с причиной, превью чека только через авторизованный стриминг, каждое решение пишется в аудит.

- [x] **Step 6: Перезапустить тесты**

### Task 6: Задача жизненного цикла и предупреждения

**Files:**
- Create: `src/jobs/run-subscription-lifecycle.ts`
- Modify: `src/jobs/job-registry.ts`
- Modify: `package.json`
- Create: `tests/integration/jobs/subscription-lifecycle.test.ts`

- [x] **Step 1: Написать падающий тест на переходы и на то, что задача идемпотентна**

`ACTIVE` с прошедшим сроком уходит в `GRACE`; `GRACE` старше семи дней уходит в `EXPIRED`; `subscriptionEndsAt = null` не трогается никогда; второй прогон подряд ничего не меняет и не шлёт второе предупреждение.

- [x] **Step 2: Запустить тест и убедиться в падении**

- [x] **Step 3: Реализовать задачу и зарегистрировать её в общем списке**

Регистрация именно в `SCHEDULED_JOBS`, иначе cron-развёртывание её потеряет — ровно та ошибка, ради которой список был сведён в один файл.

- [x] **Step 4: Слать предупреждения через существующую очередь уведомлений бизнеса**

За три дня до конца периода, в день перехода в `GRACE` и в день `EXPIRED`. Ключ дедупликации обязан пережить перезапуск задачи в ту же минуту.

- [x] **Step 5: Перезапустить тест**

### Task 7: Кабинет: тариф, оплата, история

**Files:**
- Modify: `src/app/(dashboard)/dashboard/settings/plan/page.tsx`
- Create: `src/features/dashboard/subscription/plan-picker.tsx`
- Create: `src/features/dashboard/subscription/invoice-payment-panel.tsx`
- Create: `tests/unit/dashboard/subscription.test.tsx`
- Modify: `tests/e2e/` — новый сценарий оплаты подписки

- [x] **Step 1: Написать падающие компонентные тесты**

Страница показывает действующий тариф, статус и дату окончания; `TRIALING` показывает, сколько дней осталось; `GRACE` показывает баннер с последствием и датой; выбор тарифа и периода показывает цену до подтверждения; после выставления счёта видны ссылка на оплату, сумма, номер счёта и загрузка чека; история счетов показывает статусы.

- [x] **Step 2: Запустить тесты и убедиться в падении**

- [x] **Step 3: Реализовать страницу и компоненты**

Переиспользовать `Dialog`, `StatCard`, `EmptyState` и существующие примитивы из `ui-kit`; смена тарифа проходит через подтверждение, как остальные необратимые действия.

- [x] **Step 4: Добавить баннер `GRACE` в layout кабинета**

Баннер называет дату и что именно выключится. Он не перекрывает работу и закрывается на сессию.

- [x] **Step 5: Прогнать компонентные и браузерные тесты**

### Task 8: Документация и полная верификация

**Files:**
- Modify: `docs/pilot-runbook.md`
- Modify: `README.md`
- Modify: `.env.example`

- [x] **Step 1: Описать в runbook подписки, проверку чеков платформой и что делать при спорной оплате**

Отдельно — как выдать бизнесу срок вручную и почему `subscriptionEndsAt = null` означает бессрочно.

- [x] **Step 2: Прогнать статические проверки**

Run: `pnpm prisma validate && pnpm lint && pnpm typecheck`

- [x] **Step 3: Прогнать полный сюит**

Run: `set -a; . ./.env; set +a; pnpm test`

- [x] **Step 4: Прогнать браузерные сценарии**

Run: `pnpm test:e2e`

- [x] **Step 5: Проверить диффом, что в git не попали карта платформы и суммы из тестов**

Run: `git diff --check && git status --short`
