# ManClient: pilot runbook

## 1. Что разворачивается

- один Next.js web/worker image;
- PostgreSQL 16 как источник истины;
- приватный S3-compatible bucket для чеков;
- HTTPS endpoints для Telegram и WhatsApp webhooks;
- два cron вызова каждую минуту: expiry и delivery queue.

Первый pilot подключается оператором ManClient. Саморегистрация бизнеса не включена.

## 2. Обязательные переменные

Скопируйте имена из `.env.example`. В production secret manager должны находиться:

- `DATABASE_URL`, `DATABASE_DIRECT_URL`;
- `AUTH_SECRET`, `CARD_ENCRYPTION_KEY`, `INTERNAL_API_SECRET`, `BOOKING_ACTION_SECRET`;
- S3 credentials;
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`;
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`.

`APP_URL` и `AUTH_URL` должны указывать на публичный HTTPS origin. `TELEGRAM_BOT_USERNAME` задаётся без `@`. Не используйте значения из тестов или `.env.example`.

Генерация ключей:

```bash
openssl rand -base64 32   # CARD_ENCRYPTION_KEY
openssl rand -hex 32      # остальные HMAC/session secrets
```

## 3. Database и storage

```bash
pnpm prisma migrate deploy
pnpm prisma migrate status
```

Создайте приватный bucket из `S3_BUCKET`. Public read запрещён. Включите server-side encryption, versioning и lifecycle хранения по согласованному сроку.

Backup PostgreSQL:

```bash
pg_dump --format=custom --no-owner "$DATABASE_URL" > manclient-$(date +%F).dump
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" manclient-YYYY-MM-DD.dump
```

Restore сначала проверяется на отдельной БД. `--clean` нельзя направлять на production без отдельного подтверждения.

## 4. Первый бизнес

Оператор создаёт Business, Branch, owner/admin memberships, staff, services, resources и schedule rules. Для каждого филиала:

1. Проверьте `Asia/Dushanbe` и рабочие дни.
2. Зашифруйте карту через `encryptCardNumber`; plaintext не сохраняйте и не логируйте.
3. Сохраните только encrypted value и последние четыре цифры.
4. Для автоуслуг свяжите ServiceResource с конкретным боксом или подъёмником.
5. Откройте публичную страницу и выполните тестовую запись на минимальную согласованную сумму.

Demo seed создаёт `demo-barber` и `demo-auto` только для локальной/CI проверки. Не запускайте demo seed в production.

## 5. Telegram webhook

Webhook URL: `https://<host>/api/webhooks/telegram`. При регистрации передайте `TELEGRAM_WEBHOOK_SECRET` как `secret_token`. Endpoint принимает запрос только с совпадающим `X-Telegram-Bot-Api-Secret-Token`.

После регистрации проверьте:

1. Public booking показывает персональную Telegram-ссылку.
2. `/start` связывает chat с конкретной pending payment через HMAC-token.
3. Изображение чека сохраняется в private bucket.
4. Matching receipt подтверждает запись; сомнительный попадает в `NEEDS_ATTENTION`.
5. Кнопки переноса и отмены не содержат raw booking ID без подписи.

## 6. WhatsApp Cloud API

Укажите Graph API version через `WHATSAPP_GRAPH_API_VERSION`. В `WHATSAPP_TEMPLATE_ALLOWLIST` перечислите только одобренные Meta templates. На Business задаются phone number ID, confirmation template, reminder template и language code.

Webhook URL: `https://<host>/api/webhooks/whatsapp`. GET challenge проверяет `WHATSAPP_VERIFY_TOKEN`; POST delivery updates проверяет `X-Hub-Signature-256` через `WHATSAPP_APP_SECRET`.

## 7. Jobs

Запускайте каждую минуту, с запретом параллельного overlap на уровне scheduler:

```bash
pnpm jobs:expire
pnpm jobs:reminders
```

Delivery имеет claim state, максимум три попытки и safe error в Message. Метрики для pilot: `FAILED` messages, `NEEDS_ATTENTION` payments, просроченные `PROCESSING` messages и глубина `SCHEDULED` queue.

## 8. Ротация ключа карты

1. Сделайте backup БД и остановите запись новых/редактирование карт.
2. Передайте старый и новый ключ только через secret manager environment.
3. Запустите `pnpm db:rotate-card-key`.
4. Обновите `CARD_ENCRYPTION_KEY` новым значением и перезапустите приложение.
5. Проверьте генерацию ссылки по одному филиалу; затем удалите старый key из runtime secret set.

Скрипт не выводит номера карт. Если хотя бы одна расшифровка не удалась, transaction откатывается.

## 9. Release gate

```bash
pnpm prisma validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm playwright test
```

До pilot нужны также HTTPS probe, тест webhook secret/signature, backup restore rehearsal и проверка, что bucket не публичный.
