# ManClient

ManClient — B2B SaaS для онлайн-записи сервисных бизнесов в Таджикистане: салонов, барбершопов, автосервисов и похожих компаний.

Клиент записывается на конкретного сотрудника и ресурс — на публичной странице `/b/<slug>` (ru/tg) или в Telegram-боте, — слот удерживается 15 минут, оплата идёт прямым переводом бизнесу через DushanbeCity, а чек распознаётся OCR и подтверждается автоматически либо вручную в кабинете. Бизнес получает кабинет с RBAC: календарь дня и недели с переносом визитов мышью, ручную запись, филиалы, услуги, ресурсы, расписания, правила записи и депозиты, лист ожидания, промокоды, отзывы, комиссии персонала, аналитику, экспорт CSV и аудит. Сам кабинет продаётся по подписке: новый бизнес получает 14 дней Премиума, дальше — счёт, оплата переводом и чек, который платформа сверяет так же, как чеки клиентов. Уведомления уходят в Telegram, WhatsApp Cloud API и SMS через payom.

## Локальный запуск

Требования: Node.js 22.12+, pnpm 10+, Docker.

```bash
cp .env.example .env
docker compose up -d postgres minio mailpit
pnpm install
pnpm prisma migrate deploy
pnpm db:seed
pnpm dev
```

Перед seed задайте `CARD_ENCRYPTION_KEY` и demo-пароли из `.env.example`. Значения карт, паролей и токенов в git не добавляются.

## Проверка

```bash
pnpm prisma validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`prisma` читает `.env` сам (`prisma.config.ts`), а Vitest — нет. Интеграционные тесты ходят в настоящий Postgres, поэтому перед `pnpm test` переменные нужно экспортировать в оболочку, иначе `DATABASE_URL` окажется пустым и провал выглядит как ошибка аутентификации SASL:

```bash
set -a; . ./.env; set +a
pnpm test
```

Тесты делят одну базу и идут последовательно (`fileParallelism: false`); `pnpm test:integration` гоняет только интеграционный слой.

## Документация

- [pilot runbook](docs/pilot-runbook.md) — развёртывание, переменные, jobs, подписки и оплата, бэкапы, метрики, release gate и smoke-листы;
- [обработка чеков DushanbeCity](docs/dushanbecity-receipt-handling.md) — что считается подтверждением и как разбирать `NEEDS_ATTENTION`;
- [`docs/superpowers/specs/`](docs/superpowers/specs) — проектные решения по каждой волне;
- [`docs/superpowers/plans/`](docs/superpowers/plans) — планы реализации. Все отмечены выполненными и несут заголовок со статусом и расхождениями с фактическим кодом.
