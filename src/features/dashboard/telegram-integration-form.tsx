"use client";

import { FormEvent, useState } from "react";

import type { TelegramDashboardStatus } from "@/core/integrations/telegram-dashboard-service";

type RequestState = "idle" | "checking";

export function TelegramIntegrationForm({ initialStatus }: { initialStatus: TelegramDashboardStatus }) {
  const [integration, setIntegration] = useState(initialStatus);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(initialStatus.lastWebhookError);
  const [rotating, setRotating] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [assistantState, setAssistantState] = useState<"idle" | "opening">("idle");
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [showExistingBot, setShowExistingBot] = useState(false);
  const configured = integration.status !== "DISCONNECTED";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestState("checking");
    setError(null);
    try {
      const endpoint = rotating ? "/api/integrations/telegram/rotate" : "/api/integrations/telegram";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json() as TelegramDashboardStatus | { error: string };
      if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error : "TELEGRAM_UNAVAILABLE");
      setIntegration(payload);
      setToken("");
      setRotating(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setRequestState("idle");
    }
  }

  async function disconnect() {
    setRequestState("checking");
    setError(null);
    try {
      const response = await fetch("/api/integrations/telegram/disconnect", { method: "POST" });
      const payload = await response.json() as TelegramDashboardStatus | { error: string };
      if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error : "TELEGRAM_UNAVAILABLE");
      setIntegration(payload);
      setToken("");
      setConfirmDisconnect(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setRequestState("idle");
    }
  }

  async function openBusinessAssistant() {
    setAssistantState("opening");
    setAssistantError(null);
    try {
      const response = await fetch("/api/integrations/telegram/platform-link", { method: "POST" });
      const payload = await response.json() as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error ?? "TELEGRAM_UNAVAILABLE");
      window.location.assign(payload.url);
    } catch (caught) {
      setAssistantError(errorMessage(caught));
      setAssistantState("idle");
    }
  }

  return (
    <div className="telegram-settings-grid">
      <section className="integration-status-panel" aria-labelledby="business-assistant-title">
        <div>
          <p className="context-label">Один бот от вашего бизнеса</p>
          <h2 id="business-assistant-title">Создайте только одного бота — для клиентов</h2>
          <p className="integration-help">Владельцы и команда уже работают в готовом <strong>@manclient_bot</strong>. Telegram привяжет ваш аккаунт к бизнесу, а клиентский бот сразу будет принадлежать вам.</p>
        </div>
        <div className="integration-actions">
          <button className="primary-button" type="button" disabled={assistantState === "opening"} onClick={openBusinessAssistant}>
            {assistantState === "opening" ? "Открываем Telegram..." : configured ? "Открыть @manclient_bot" : "Создать клиентского бота"}
          </button>
          {!configured ? <button className="secondary-action" type="button" onClick={() => setShowExistingBot(true)}>Подключить существующего бота</button> : null}
        </div>
        {assistantError ? <p className="integration-error" role="alert">{assistantError}</p> : null}
        <small>Создание подтверждается в Telegram. ManClient не получает пароль, код входа или Telegram-сессию владельца.</small>
      </section>

      <section className="integration-status-panel" aria-live="polite">
        <div className="integration-status-heading">
          <div>
            <span className={`integration-status-dot integration-status-${integration.status.toLowerCase()}`} aria-hidden="true" />
            <strong>{statusTitle(integration.status)}</strong>
          </div>
          <span className="status">{statusLabel(integration.status)}</span>
        </div>
        {configured ? (
          <>
            <p className="integration-bot-name">@{integration.botUsername}</p>
            <p className="integration-help">Это единственный бот, который создаёт бизнес. Он принимает записи и оплату клиентов; команда продолжает работать через @manclient_bot.</p>
            <div className="integration-actions">
              <button className="secondary-action" type="button" disabled={requestState === "checking"} onClick={openBusinessAssistant}>
                Создать другого бота
              </button>
              <button className="quiet-action" type="button" disabled={requestState === "checking"} onClick={() => { setRotating(true); setShowExistingBot(true); setConfirmDisconnect(false); }}>
                Подключить существующего
              </button>
              <button className="danger-action" type="button" disabled={requestState === "checking"} onClick={() => { setConfirmDisconnect(true); setRotating(false); }}>
                Отключить бота
              </button>
            </div>
          </>
        ) : (
          <p className="integration-help">Клиентский бот пока не создан. Нажмите «Создать клиентского бота»: Telegram оформит ownership сразу на ваш аккаунт, а ManClient подключит интеграцию автоматически.</p>
        )}
      </section>

      {(showExistingBot || rotating) ? (
        <form className="integration-token-form" onSubmit={submit} noValidate>
          <div>
            <h2>{rotating ? "Подключить другого существующего бота" : "Подключить существующего бота"}</h2>
            <p>Этот запасной путь нужен, только если бот уже создан через @BotFather. Токен исчезнет с экрана и будет храниться в зашифрованном виде.</p>
          </div>
          <label className="field-label" htmlFor="telegram-bot-token">Токен клиентского бота</label>
          <input
            className="text-input integration-token-input"
            id="telegram-bot-token"
            name="telegramBotToken"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "telegram-token-error" : "telegram-token-hint"}
            onChange={event => setToken(event.target.value)}
            placeholder="123456789:AA..."
          />
          <small id="telegram-token-hint">Не используйте здесь токен основного бота ManClient.</small>
          {error ? <p className="integration-error" id="telegram-token-error" role="alert">{error}</p> : null}
          <div className="integration-actions">
            <button className="primary-button integration-submit" type="submit" disabled={requestState === "checking"}>
              {requestState === "checking" ? "Проверяем бота..." : rotating ? "Сменить бота" : "Подключить бота"}
            </button>
            <button className="quiet-action" type="button" onClick={() => { setRotating(false); setShowExistingBot(false); setToken(""); setError(null); }}>
              {rotating ? "Оставить текущего бота" : "Отмена"}
            </button>
          </div>
        </form>
      ) : null}

      {configured && confirmDisconnect ? (
        <section className="integration-confirm" aria-labelledby="disconnect-title">
          <h2 id="disconnect-title">Отключить @{integration.botUsername}?</h2>
          <p>Новые сообщения клиентов перестанут поступать в ManClient. Сам бот в Telegram не удалится.</p>
          {error ? <p className="integration-error" role="alert">{error}</p> : null}
          <div className="integration-actions">
            <button className="danger-button" type="button" disabled={requestState === "checking"} onClick={disconnect}>
              {requestState === "checking" ? "Отключаем..." : "Отключить бота"}
            </button>
            <button className="quiet-action" type="button" onClick={() => setConfirmDisconnect(false)}>Оставить подключённым</button>
          </div>
        </section>
      ) : null}

      {configured && error && !rotating && !confirmDisconnect ? <p className="integration-error" role="alert">{error}</p> : null}
    </div>
  );
}

function statusTitle(status: TelegramDashboardStatus["status"]) {
  if (status === "ACTIVE") return "Бот подключён";
  if (status === "PENDING") return "Подключаем бота";
  if (status === "ERROR") return "Бот требует внимания";
  return "Бот не подключён";
}

function statusLabel(status: TelegramDashboardStatus["status"]) {
  if (status === "ACTIVE") return "Работает";
  if (status === "PENDING") return "Проверяется";
  if (status === "ERROR") return "Ошибка";
  return "Не настроен";
}

function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "TELEGRAM_UNAVAILABLE";
  const messages: Record<string, string> = {
    INVALID_BOT_TOKEN: "Telegram не принял этот токен. Скопируйте токен целиком из @BotFather и попробуйте снова.",
    BOT_ALREADY_CONNECTED: "Этот бот уже подключён к другому бизнесу. Создайте отдельного бота в @BotFather.",
    NOT_CONNECTED: "Бот уже отключён. Обновите страницу, чтобы увидеть актуальный статус.",
    FORBIDDEN: "У вас нет доступа к настройке интеграций. Обратитесь к владельцу бизнеса.",
    CONFIGURATION_ERROR: "Интеграция пока не настроена на стороне ManClient. Обратитесь в поддержку.",
    TELEGRAM_NOT_CONFIGURED: "Бизнес-ассистент ещё не настроен на стороне ManClient. Обратитесь в поддержку.",
    TELEGRAM_UNAVAILABLE: "Не удалось связаться с Telegram. Проверьте соединение и попробуйте снова.",
  };
  return messages[code] ?? messages.TELEGRAM_UNAVAILABLE;
}
