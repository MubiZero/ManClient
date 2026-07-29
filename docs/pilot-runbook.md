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
- `AUTH_SECRET`, `CARD_ENCRYPTION_KEY`, `INTEGRATION_ENCRYPTION_KEY`, `INTERNAL_API_SECRET`, `BOOKING_ACTION_SECRET`, `PLATFORM_LINK_SECRET`;
- S3 credentials;
- platform bot credentials: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`;
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`.

`APP_URL` и `AUTH_URL` должны указывать на публичный HTTPS origin. `TELEGRAM_BOT_USERNAME` задаётся без `@`. Не используйте значения из тестов или `.env.example`.

Генерация ключей:

```bash
openssl rand -base64 32   # CARD_ENCRYPTION_KEY и INTEGRATION_ENCRYPTION_KEY
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

## 5. Telegram platform и клиентские боты

`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` и `TELEGRAM_WEBHOOK_SECRET` принадлежат только бизнес-ассистенту ManClient. Токены клиентских ботов не добавляются в environment: владелец подключает их в `Настройки -> Интеграции`, после чего они хранятся зашифрованно с `INTEGRATION_ENCRYPTION_KEY`.

После deploy зарегистрируйте platform webhook. Скрипт не выводит token или secret:

```bash
pnpm telegram:register-platform-webhook -- --dry-run
pnpm telegram:register-platform-webhook
```

Целевой URL: `https://<host>/api/webhooks/telegram/platform`. Endpoint принимает запрос только с совпадающим `X-Telegram-Bot-Api-Secret-Token`. Старый `/api/webhooks/telegram` после cutover обязан отвечать `410 Gone`.

Проверка без вывода credentials:

```bash
curl --fail --silent --show-error "$APP_URL/api/health"
curl --silent --output /dev/null --write-out '%{http_code}\n' "$APP_URL/api/webhooks/telegram"
```

Ожидается `200` для health и `410` для legacy webhook.

### Подключение tenant bot

1. Владелец или администратор создаёт отдельного бота через `@BotFather`.
2. В кабинете открывает `Настройки -> Интеграции` и вставляет token.
3. ManClient проверяет `getMe`, регистрирует уникальный webhook `/api/webhooks/telegram/business/<publicId>` и удаляет token из UI.
4. Отправьте `/start` в клиентский бот и проверьте выбор языка, филиала и услуги.

При ротации сначала регистрируется новый webhook. Если Telegram недоступен, старый бот остаётся активным. Отключение удаляет webhook и зашифрованные credentials, но не удаляет самого бота в Telegram.

После регистрации проверьте:

1. Public booking показывает ссылку tenant bot, а не `@manclient_bot`.
2. `/start` в platform bot показывает бизнес-ассистента; подписанная ссылка из кабинета привязывает бизнес-чат и истекает через 15 минут.
3. Изображение чека сохраняется в private bucket.
4. Matching receipt подтверждает запись; сомнительный попадает в `NEEDS_ATTENTION`.
5. Кнопки переноса и отмены не содержат raw booking ID без подписи.

### Rollback Telegram cutover

Код и миграции additive (добавляют таблицы и индексы), поэтому rollback приложения не требует отката схемы. Перед rollback сохраните backup, разверните предыдущий проверенный image/SHA и верните platform webhook на поддерживаемый этим SHA endpoint. Не удаляйте новые таблицы в incident: это необратимо уничтожит tenant integrations и conversation state.

Если потерян `INTEGRATION_ENCRYPTION_KEY`, tenant bot tokens восстановить нельзя. Верните ключ из secret-manager backup или переподключите каждого бота новым token через кабинет. Ротация этого ключа требует отдельной транзакционной утилиты; простая замена environment сломает расшифровку существующих integrations.

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
