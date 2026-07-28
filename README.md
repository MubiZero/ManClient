# ManClient

ManClient — B2B SaaS для онлайн-записи сервисных бизнесов в Таджикистане: салонов, барбершопов, автосервисов и похожих компаний.

MVP включает публичную запись на конкретного сотрудника и ресурс, 15-минутное удержание слота, прямую оплату бизнесу через DushanbeCity, подтверждение по чеку в Telegram, перенос и отмену, кабинет с RBAC, напоминания и WhatsApp Cloud API adapter.

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
pnpm playwright test
```

Операционные инструкции: [pilot runbook](docs/pilot-runbook.md) и [обработка чеков DushanbeCity](docs/dushanbecity-receipt-handling.md).
