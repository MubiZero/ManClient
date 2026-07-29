# Managed Client Bot Onboarding

**Date:** 2026-07-29  
**Status:** approved direction, awaiting written-spec review

## Product decision

A business creates only one Telegram bot: its customer-facing bot. Owners and staff use the shared `@manclient_bot` business assistant and never register a second administrative bot.

The preferred onboarding path uses Telegram Managed Bots. The customer bot is owned by the business owner's Telegram account from the moment it is created. `@manclient_bot` is its manager, which lets ManClient obtain and rotate the bot token and configure the customer webhook. There is no temporary ManClient ownership and no later ownership transfer.

Manual token connection remains available only for an existing customer bot that the business already owns. It is a fallback, not the primary onboarding path.

## User journey

1. An authenticated owner or administrator opens Telegram settings in ManClient.
2. The page explains that the business creates one bot for customers and that the ready-made `@manclient_bot` serves the team.
3. The user links their Telegram account to the business through the existing short-lived `@manclient_bot` deep link.
4. Inside `@manclient_bot`, the user chooses `Создать клиентского бота`.
5. ManClient asks for the public bot name and suggests a username ending in `bot`. The user may change both in Telegram before confirming.
6. `@manclient_bot` sends an official managed-bot creation link in the form `https://t.me/newbot/manclient_bot/<suggested_username>?name=<display_name>`.
7. Telegram shows the native confirmation screen. The user creates the bot; ownership belongs directly to that Telegram user.
8. The platform webhook receives the managed-bot update, matches it to the pending onboarding intent, obtains the token through `getManagedBotToken`, and connects the existing tenant webhook.
9. `@manclient_bot` confirms the connected `@username` and presents the customer link. The dashboard reflects the active state.

The user never copies or sends a token in the preferred flow. Bot ownership, the ManClient manager relationship, and customer access are explained separately so that “ManClient manages the integration” is not mistaken for “ManClient owns the bot.”

## Authorization and intent matching

Managed-bot creation starts only from a private chat already linked to an active `OWNER` or `ADMIN` membership. Before sending the creation link, ManClient creates a single-use `ManagedBotConnectionIntent` containing:

- `businessId` and `membershipId`;
- the linked Telegram user ID;
- normalized suggested username and display name;
- expiration time of 30 minutes;
- `PENDING`, `PROCESSING`, `COMPLETED`, `EXPIRED`, or `FAILED` status;
- the resulting Telegram bot ID when known.

Only one pending intent is allowed per membership. Creating a new intent expires the previous one. A `managed_bot` update is accepted only when its creating user matches the intent's Telegram user, the membership remains active with `OWNER` or `ADMIN` role, and the intent has not expired. The Telegram bot ID is globally unique in active integrations.

If a user belongs to several businesses, the business currently linked to that private chat determines the target. To configure another business, the user follows that business's dashboard link, which replaces the active chat association before the intent is created. An update without a matching intent does not connect a bot automatically; the assistant tells the user to restart setup for the intended business.

## Telegram integration boundary

The existing platform webhook remains the only runtime entry point for `@manclient_bot`. It is extended to accept the Bot API managed-bot update type. No Telegram user session, MTProto worker, or BotFather automation is introduced.

The platform Telegram adapter gains narrowly scoped operations:

- build a validated managed-bot creation link;
- parse the managed-bot update;
- call `getManagedBotToken` for the created bot;
- optionally call `replaceManagedBotToken` only during an explicit recovery or rotation action.

The exported token is passed directly to the existing customer-bot connection service. It is encrypted before persistence and must never appear in application logs, audit metadata, responses, error-monitoring payloads, or chat messages.

`@manclient_bot` must have Bot Management Mode enabled in BotFather. Startup/runtime configuration validates that the configured platform bot reports `can_manage_bots`; if not, the dashboard disables managed creation and shows an operational configuration error while preserving manual connection for an existing bot.

## Connection transaction

Managed creation reuses the established tenant integration rules:

1. claim the pending intent idempotently;
2. verify current membership and business scope;
3. obtain the managed bot token from Telegram;
4. call `getMe` and verify that the returned bot ID matches the managed-bot update;
5. reject a bot already active for another business without revealing that business;
6. generate the tenant integration ID and webhook secret;
7. register the tenant webhook and customer command menu;
8. atomically activate `BusinessTelegramIntegration`, record `connectionMethod = MANAGED`, and complete the intent;
9. write a secret-free audit event and notify the owner through `@manclient_bot`.

Retries of the same Telegram update return the existing result and do not rotate the token or create another integration. If Telegram accepts creation but ManClient fails later, the intent stays retryable with a bounded safe error. The bot remains owned by the user and can be connected again without recreation.

## Existing bots and rotation

Businesses that already own a customer bot can choose `Подключить существующего бота` and paste its BotFather token in the authenticated dashboard. Sending raw tokens to `@manclient_bot` is removed from the normal flow; during migration it may remain temporarily supported with immediate message deletion and a warning to use the dashboard.

Changing the customer bot is explicit:

- create another managed bot and cut over only after its webhook succeeds; or
- connect another existing bot through the fallback form.

Disconnecting ManClient removes the customer webhook and stored ciphertext but does not delete the Telegram bot or transfer ownership. For a managed bot, the UI also explains that disconnecting the integration does not automatically remove `@manclient_bot` as manager; Telegram-side manager removal is a separate owner-controlled action in BotFather.

## Data model

Add `ManagedBotConnectionIntent` with the authorization and lifecycle fields described above. Add to `BusinessTelegramIntegration`:

- `connectionMethod`: `MANAGED` or `TOKEN`, defaulting existing rows to `TOKEN`;
- `managedOwnerTelegramUserId`: nullable, populated for managed creation;
- `managedAt`: nullable timestamp.

No plaintext credential or reusable creation secret is stored. Existing `botTokenEncrypted`, webhook isolation, and one-active-bot-per-business constraints remain authoritative.

## Interface copy

The settings page leads with:

> Создайте только одного бота — для ваших клиентов. Владельцы и команда работают в готовом `@manclient_bot`; его нужно лишь привязать к бизнесу.

Primary actions are:

- `Привязать Telegram к @manclient_bot` when the team chat is not linked;
- `Создать клиентского бота` after linking;
- `Подключить существующего бота` as a secondary action;
- `Открыть клиентского бота`, `Заменить` and `Отключить` for an active integration.

The onboarding checklist says `Создать клиентского Telegram-бота`, not the ambiguous `Подключить Telegram`. Registration and help copy repeat the one-bot model. Internal legacy names such as `BusinessTelegramIntegration` may remain for this scoped change; a broad rename is not required for user correctness.

## Failure states

- Username occupied: Telegram lets the user edit it before confirmation; ManClient can generate another suggestion on retry.
- Bot creation limit reached: explain Telegram's account limit and link to BotFather bot management; do not suggest creating the bot under a ManClient account.
- Management Mode disabled: show a platform configuration error and retain existing-bot connection.
- Intent expired or wrong Telegram account: do not connect the bot; ask the user to restart from the intended linked account.
- Token export or webhook registration unavailable: retain a retryable intent and show that the Telegram bot was created but is not connected yet.
- Duplicate bot or business already connected: preserve the current active integration and require an explicit replacement flow.
- Ownership or token changed later: mark the integration as requiring attention when Telegram reports an update or customer delivery proves credentials invalid; never rotate silently except within an explicit recovery action.

## Security and audit

- Bot creation is confirmed by Telegram under the owner's authenticated Telegram account.
- ManClient never logs in as the owner and never asks for their Telegram password, OTP, 2FA value, or session.
- Only a linked current `OWNER` or `ADMIN` can start or complete connection.
- Managed tokens follow the same authenticated encryption and redaction rules as manually supplied tokens.
- Audit records capture actor, business, bot ID, username, connection method, intent result, and timestamps, but never tokens or Telegram authentication material.
- Webhook tenant resolution remains based only on the random integration public ID and secret, never username or user-supplied business ID.

## Tests and release gates

- Unit: managed creation-link encoding, username validation, update parsing, error mapping, and token redaction.
- Integration: single-use intent, expiry, wrong user, revoked membership, multi-business relinking, duplicate update, duplicate bot, token export failure, webhook rollback, and successful managed connection.
- Existing-token compatibility: current manually connected bots continue to receive customer updates and reminders unchanged.
- Browser: settings explain one bot, primary managed-creation path, secondary existing-bot path, pending/success/failure states, and mobile layout.
- Production smoke: verify `@manclient_bot` reports management capability, create a disposable managed bot from a designated test owner, confirm ownership in Telegram, prove the tenant webhook and `/start`, then disconnect and remove the disposable bot manually.

No production bot is created, transferred, disconnected, or deleted as part of implementation without a separate explicit deployment/smoke-test approval.

## Non-goals

- creating bots under a shared ManClient employee account and transferring them later;
- automating BotFather through a Telegram user account;
- taking ownership of customer bots;
- deleting customer bots from Telegram;
- multiple active customer bots per business;
- renaming the entire existing Telegram domain model in the same change.
