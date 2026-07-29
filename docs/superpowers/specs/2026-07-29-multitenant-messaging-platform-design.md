# ManClient Multi-tenant Messaging Platform Design

**Date:** 2026-07-29  
**Status:** approved in conversation, awaiting written-spec review

## Product boundary

ManClient has two distinct Telegram products:

1. `@manclient_bot` is the private business assistant for owners and staff. It never handles customer bookings or customer receipts.
2. Each business connects one white-label Telegram bot for its customers. That bot handles branch selection, booking, payment, receipts, reminders, rescheduling, cancellation, and operator handover.

The web booking page remains an equal customer channel. Telegram, web, and later WhatsApp call the same booking and payment domain services; channel adapters must not duplicate availability, allocation, payment, or tenant rules.

## Delivery strategy

This design describes the full product architecture. Delivery remains vertical and independently releasable:

1. Securely separate the ManClient business bot from tenant customer bots and support customer-bot connection.
2. Deliver the complete customer booking journey in Telegram on the shared conversation engine.
3. Add booking management, operator handover, and business-assistant operations.
4. Add WhatsApp as another adapter over the same conversation engine.
5. Add consent-aware CRM communication and funnel analytics.

No stage may fake later functionality or present an incomplete control as operational.

## Identity and tenancy

### Business assistant

An owner links a private chat with `@manclient_bot` by opening a short-lived, single-use signed URL generated from an authenticated ManClient session. The token contains the user and business membership identifiers and expires after 15 minutes. The server verifies that the membership still exists and has `OWNER` or `ADMIN` role before linking the chat.

An unlinked `/start` returns a business-oriented welcome message and a button to the ManClient login page. It must not mention customer receipts or pretend that a business is connected.

### Customer bot

Each active customer-bot integration belongs to exactly one `businessId`. Incoming customer updates resolve the tenant exclusively from a random public integration identifier in the webhook route. A Telegram payload, username, chat ID, command argument, or client-supplied business ID can never select the tenant.

One active customer bot is allowed per business. A Telegram bot ID can belong to only one active ManClient business. One bot serves all branches; customers choose a branch in the conversation.

## Connecting a customer bot

Owners and administrators can connect a bot in two ways:

- **Dashboard:** paste the BotFather token into the authenticated integration form.
- **Business assistant:** after linking the private chat to a membership, send the token to `@manclient_bot`.

Both routes call the same application service. It:

1. validates the actor's current membership and role;
2. calls Telegram `getMe` and requires a bot account with a username;
3. rejects a Telegram bot already active for another business;
4. generates an unguessable integration ID and webhook secret;
5. encrypts the token with authenticated encryption;
6. registers the tenant webhook with Telegram;
7. commits the new active integration only after Telegram accepts the webhook;
8. records an audit event without token material.

When a token is sent through the business assistant, ManClient attempts to delete the incoming token message immediately after reading it and never repeats the token in a response or log. Deletion reduces exposure but is not presented as eliminating Telegram-side retention; the dashboard remains the recommended route.

## Rotation and disconnection

Token replacement is an atomic cutover:

1. validate the replacement token and bot identity;
2. register a new webhook secret and verify Telegram acceptance;
3. switch the active encrypted credential in one transaction;
4. remove the old webhook after the new integration is active;
5. record success or a safe failure reason in the audit log.

Failure before the transaction leaves the current bot operational. Disconnecting removes the Telegram webhook, revokes active ManClient sessions for that integration, marks it disconnected, and retains non-secret audit history. The token ciphertext is removed after successful disconnection.

## Data model

### `BusinessTelegramIntegration`

- `id`: internal cuid primary key;
- `businessId`: unique active owner relation;
- `publicId`: unique random webhook route identifier;
- `botId`: unique Telegram bot identifier;
- `botUsername`: public display value;
- `botTokenEncrypted`: authenticated ciphertext;
- `webhookSecretEncrypted`: authenticated ciphertext;
- `status`: `PENDING`, `ACTIVE`, `ERROR`, or `DISCONNECTED`;
- `lastWebhookError`: bounded, sanitized error text;
- `connectedByUserId`, `connectedAt`, `disconnectedAt`, timestamps.

Ciphertext uses a dedicated `INTEGRATION_ENCRYPTION_KEY`, not the payment-card key. The key is a base64-encoded 32-byte runtime secret. Tokens and webhook secrets are never returned from read APIs.

### `BusinessTelegramChat`

Links a private `chatId` to a `membershipId`. The pair is unique and is disabled when membership is removed or the user disconnects it.

### `Conversation`

Represents a durable customer conversation scoped by `businessId`, channel, integration, and external chat identity. It stores lifecycle status and the active flow version, not arbitrary executable state.

### `ConversationSession`

Stores the current state-machine node, validated JSON data, expiration time, and optimistic version. A unique active-session constraint prevents two concurrent flows for one conversation.

### `InboundChannelUpdate`

Stores `integrationId` plus Telegram `update_id` with a unique constraint. This makes webhook processing idempotent before domain side effects run.

## Webhook boundaries

- Business assistant: `POST /api/webhooks/telegram/platform` using the global platform webhook secret.
- Customer bots: `POST /api/webhooks/telegram/business/[publicId]` using the tenant integration's webhook secret.

Webhook secret comparison is timing-safe. Customer webhook processing loads the integration by `publicId`, rejects non-active integrations, checks the tenant-specific secret, claims the Telegram `update_id`, and only then dispatches the update.

The existing `/api/webhooks/telegram` route is removed after migration. During deployment it may return `410 Gone` with no forwarding, so old global customer traffic cannot cross tenant boundaries accidentally.

## Conversation engine

The channel-neutral engine consumes validated commands and produces declarative responses:

```ts
type ConversationCommand = {
  businessId: string;
  conversationId: string;
  kind: string;
  payload: unknown;
};

type ConversationReply = {
  text: LocalizedMessage;
  actions?: ReplyAction[];
};
```

Telegram callbacks contain opaque, short-lived action IDs stored server-side; they do not embed trusted `businessId`, prices, service IDs, or authorization claims. The engine locks or version-checks the session while applying a command, so duplicate or concurrent callbacks cannot create two bookings.

Flow definitions are versioned. A session continues on the version it started with until completion or expiry; new sessions use the current version.

## Customer booking journey

The first complete Telegram flow is:

1. `/start` and language selection (`ru`, `tg`);
2. branch selection;
3. service selection;
4. staff selection and required resource allocation;
5. date and available slot selection in the branch timezone;
6. name and `+992` phone confirmation using Telegram contact sharing or typed input;
7. booking creation with the existing 15-minute `PENDING_PAYMENT` hold;
8. direct DushanbeCity payment link for that branch;
9. receipt image upload to the same business bot;
10. confirmation, reminder scheduling, reschedule, and cancellation actions.

The engine calls the existing availability, allocation, payment, receipt, audit, and notification services. It does not reimplement them. Adjacent slots remain valid under the existing half-open interval rule.

The customer can use `Мои записи` to view future bookings for the same business and verified phone/chat identity. Cross-business booking discovery is not provided.

## Business-assistant journey

The platform bot supports:

- unlinked business welcome and secure login/link action;
- connection status for the current business;
- customer-bot token connection after account linking;
- receipt-review notifications with safe booking context;
- calendar summaries and bounded operational actions in later stages.

If a linked user belongs to multiple businesses, the assistant requires an explicit business selection and stores the active choice per chat. Every action rechecks membership and role at execution time.

## Operator handover

A customer can request an administrator. The conversation enters `WAITING_FOR_OPERATOR`; automation acknowledges receipt and stops sending workflow prompts. Authorized staff see the conversation in the dashboard, claim it, respond through the business bot, and return it to automation explicitly. Handover actions are audited and tenant-scoped.

## Outbound delivery

All Telegram messages use the existing durable `Message` concept extended with integration identity, external update/message IDs, bounded retry, and rate-limit-aware scheduling. Domain transactions enqueue an outbox record; workers perform network delivery. Telegram errors store safe codes and bounded descriptions, never token-bearing URLs or response bodies.

WhatsApp later implements the same channel adapter interface and conversation commands. Channel-specific button and template constraints remain inside adapters.

## Security and privacy

- No bot token, webhook secret, card number, or receipt image is stored in logs or audit metadata.
- Integration credentials use a dedicated encryption key and authenticated encryption.
- Dashboard mutations require authenticated `OWNER` or `ADMIN` membership and CSRF-safe application patterns.
- Platform-chat mutations require a currently active linked membership.
- All tenant queries include `businessId`; identifiers are never authorization by themselves.
- Webhooks are rate-limited per integration and globally, with bounded payload sizes.
- Receipt access uses private object storage and authorized, expiring retrieval.
- CRM messages require recorded consent and an opt-out path before promotional delivery is enabled.

## Failure handling

- Invalid token: reject without storing it and provide a safe correction message.
- Duplicate bot: reject without revealing the other business.
- Telegram unavailable during connection: keep the current integration unchanged and allow retry.
- Invalid webhook secret or unknown integration: return `401` or `404` without tenant details.
- Duplicate update: acknowledge without repeating effects.
- Expired conversation: start a new session while preserving already-created bookings.
- Slot lost during confirmation: return to availability with fresh slots; never overbook.
- Receipt recognition failure: retain the receipt for authorized review and clearly keep the booking awaiting confirmation.
- Outbound failure: preserve domain state, retry within limits, then expose a safe operational warning.

## Dashboard experience

The Telegram integration settings show:

- disconnected, checking, active, and error states;
- connected bot avatar, username, and connection date;
- actions `Проверить`, `Заменить бота`, and `Отключить`;
- the latest safe webhook error and a retry action;
- no recoverable token value.

Connecting and rotating provide immediate progress feedback. A successful action updates optimistically only after `getMe` validation; webhook-registration failure rolls the UI back to the previous active integration.

## Observability and analytics

Operational metrics include webhook latency/error rate, deduplicated updates, outbound retry rate, integration status, and queue age. Product analytics record consent-safe funnel events such as flow started, branch selected, slot viewed, booking held, payment submitted, and booking confirmed. Events contain business-scoped internal IDs and never tokens, message bodies, phone numbers, or receipt contents.

## Testing and release gates

- Unit tests: credential encryption, token parsing, callback action expiry, state transitions, localization, and safe error mapping.
- Integration tests: tenant isolation, duplicate bot rejection, single-use platform linking, idempotent updates, connection rollback, token rotation, booking allocation, receipt confirmation, and handover permissions.
- Contract tests: Telegram `getMe`, `setWebhook`, `deleteWebhook`, send/delete message adapters using deterministic fakes.
- Browser tests: dashboard connect/replace/disconnect states and mobile behavior.
- Production smoke: platform `/start`, tenant webhook secret rejection, tenant bot `/start`, a complete seeded booking path without a real charge, health endpoints, queue health, and exact deployment SHA/image evidence.

Production migrations must be additive before code cutover. Destructive cleanup of the legacy global customer route and variables occurs only after tenant bots are active and verified.

## Explicit non-goals for the first two stages

- Telegram business directory or marketplace discovery;
- promotional campaigns before consent and opt-out are implemented;
- AI-generated free-form booking decisions;
- multiple active customer bots per business;
- per-branch bots;
- weakening receipt, authorization, tenant, or rate-limit controls for faster rollout.
