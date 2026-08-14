/**
 * Human names for what the journal records. The log is read during an incident, when nobody should
 * have to translate `telegram.integration.rotated` in their head — and the raw code stays as the
 * fallback, because a new event type unnamed here is still better shown than swallowed.
 */
const AUDIT_EVENT_LABELS: Record<string, string> = {
  "auth.password_reset": "Пароль восстановлен",
  "booking.cancelled": "Запись отменена",
  "booking.confirmed": "Запись подтверждена",
  "booking.confirmed_manually": "Запись подтверждена вручную",
  "booking.created": "Запись создана",
  "booking.no_show": "Клиент не пришёл",
  "booking.payment_reminder_scheduled": "Запланировано напоминание об оплате",
  "booking.rescheduled": "Запись перенесена",
  "booking_policy.updated": "Изменены правила записи",
  "booking_series.cancelled": "Отменена серия записей",
  "branch.archived": "Филиал архивирован",
  "branch.created": "Филиал создан",
  "branch.restored": "Филиал восстановлен",
  "branch.updated": "Филиал изменён",
  "branding.updated": "Изменено оформление",
  "business.created_by_admin": "Бизнес создан администратором",
  "business.plan_changed": "Изменён тариф бизнеса",
  "business.reactivated": "Бизнес возобновлён",
  "business.suspended": "Бизнес приостановлен",
  "integration.alerted": "Оповещение об интеграции",
  "notifications.updated": "Изменены настройки уведомлений",
  "onboarding.payment_skipped": "Онбординг завершён без карты для оплаты",
  "payment.review_approved": "Чек клиента подтверждён",
  "payment.review_rejected": "Чек клиента отклонён",
  "platform.plan_price.changed": "Изменена цена тарифа",
  "platform.plan_price.cleared": "Сброшена цена тарифа",
  "promo_code.created": "Промокод создан",
  "promo_code.deactivated": "Промокод отключён",
  "receipt.needs_review": "Чек отправлен на ручную проверку",
  "receipt.submitted": "Клиент прислал чек",
  "resource.archived": "Ресурс архивирован",
  "resource.created": "Ресурс создан",
  "resource.restored": "Ресурс восстановлен",
  "resource.updated": "Ресурс изменён",
  "schedule.branch.updated": "Изменён график филиала",
  "schedule.exception.removed": "Удалено исключение в графике",
  "schedule.exception.saved": "Сохранено исключение в графике",
  "schedule.staff.updated": "Изменён график специалиста",
  "service.archived": "Услуга архивирована",
  "service.created": "Услуга создана",
  "service.restored": "Услуга восстановлена",
  "service.updated": "Услуга изменена",
  "staff.archived": "Специалист архивирован",
  "staff.created": "Специалист создан",
  "staff.restored": "Специалист восстановлен",
  "staff.updated": "Специалист изменён",
  "subscription.paid": "Подписка оплачена",
  "subscription.receipt_rejected": "Чек за подписку отклонён",
  "telegram.integration.connected": "Telegram-бот подключён",
  "telegram.integration.disconnected": "Telegram-бот отключён",
  "telegram.integration.old_webhook_cleanup_failed": "Не удалось убрать старый webhook Telegram",
  "telegram.integration.retried": "Повторная попытка подключить Telegram-бота",
  "telegram.integration.rotated": "Заменён токен Telegram-бота",
  "whatsapp.updated": "Изменены настройки WhatsApp",
};

/** Who did it. The database keeps two spellings of the cabinet user, and both mean the same person. */
const AUDIT_ACTOR_LABELS: Record<string, string> = {
  customer: "Клиент",
  membership: "Сотрудник бизнеса",
  platform_admin: "Администратор платформы",
  receipt: "Автоматическая сверка чека",
  system: "Система",
  user: "Пользователь кабинета",
  USER: "Пользователь кабинета",
};

export function auditEventLabel(type: string): string {
  return AUDIT_EVENT_LABELS[type] ?? type;
}

export function auditActorLabel(actorType: string): string {
  return AUDIT_ACTOR_LABELS[actorType] ?? actorType;
}
