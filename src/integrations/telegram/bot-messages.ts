export type BotLocale = "ru" | "tg";

export const botMessagesRu = {
  // platform-update-handler.ts
  managedBotCreationDone: "Бизнес «{business}» подключён. Создайте единственного бота, который нужен бизнесу — клиентского. Он сразу будет принадлежать вам.",
  keyboardCreateCustomerBot: "Создать клиентского бота",
  keyboardMainMenu: "Главное меню",
  keyboardCheckReceipts: "Проверить чеки",
  keyboardSettings: "Настройки",
  keyboardCustomerLink: "Ссылка для клиентов",
  keyboardMore: "Ещё",
  keyboardHelp: "Помощь",
  linkInvalidOrExpired: "Ссылка подключения недействительна или истекла. Создайте новую ссылку в кабинете ManClient.",
  tokenRejectedDeleted: "Токены в чате не принимаются. Подключите существующего бота через защищённую форму в кабинете ManClient.",
  tokenRejectedNotDeleted: "Не удалось удалить сообщение с токеном. Удалите его вручную, перевыпустите токен в @BotFather и подключите бота через защищённую форму в кабинете ManClient.",
  managedBotCreationForbidden: "Создание клиентского бота доступно владельцу или администратору в личном чате с @manclient_bot.",
  managedBotCreationPrompt: "Telegram покажет создание клиентского бота. Бот сразу будет принадлежать вам, а ManClient подключит его автоматически.",
  managedBotIntentMissing: "Не удалось определить бизнес для этого бота. Откройте нужный бизнес в ManClient и запустите создание ещё раз.",
  managedBotFailed: "Бот создан и принадлежит вам, но ManClient пока не смог подключить его. Повторите подключение позже — создавать нового бота не нужно.",
  loginPrompt: "ManClient — помощник для управления записью вашего бизнеса. Войдите в кабинет, чтобы подключить компанию.",
  loginButton: "Войти в кабинет",

  // business-bot-handler.ts — static text
  bookingsFilterPrompt: "Какие записи показать?",
  staleActionText: "Это действие уже недействительно. Обновите данные или откройте актуальное меню.",
  staleActionSimpleText: "Это действие уже недействительно. Откройте актуальное меню.",
  checksAccessDenied: "Проверка чеков доступна владельцу и администратору.",
  helpText: "Используйте меню для записей и рабочего дня. Бизнес создаёт только одного бота — клиентского; владельцы и команда работают здесь, в общем @manclient_bot.",
  customerLinkPrompt: "Ссылка для записи клиентов:",
  customerLinkButton: "Открыть запись",
  receiptPhotoUnavailable: "Фото чека временно недоступно. Обновите карточку и попробуйте снова.",
  bookingConfirmedManual: "Запись подтверждена вручную. Банковская проверка оплаты не выполнялась.",
  reminderScheduled: "Напоминание об оплате запланировано.",
  reminderAlreadyScheduled: "Напоминание об оплате уже запланировано.",
  bookingRescheduled: "Запись перенесена.",
  bookingCancelled: "Запись отменена. Причина сохранена.",
  paymentApproved: "Оплата подтверждена. Запись подтверждена.",
  paymentAlreadyApproved: "Оплата уже подтверждена. Показано текущее состояние.",
  paymentRejected: "Чек отклонён. Причина сохранена.",
  paymentAlreadyRejected: "Чек уже отклонён. Показано текущее состояние.",
  rescheduleDatesPrompt: "Выберите новую дату. Старое время сохранится до успешного переноса.",
  rescheduleDatesEmpty: "На ближайшие 7 дней свободных дат нет. Старое время записи сохранено.",
  rescheduleSlotsPrompt: "Выберите новое время. Доступность будет проверена ещё раз перед переносом.",
  rescheduleSlotsEmpty: "На эту дату свободного времени уже нет. Выберите другую дату.",
  cancellationConfirmPrompt: "Отменить запись? Выберите причину для подтверждения отмены.",
  cancellationReasonCustomer: "Клиент попросил отменить",
  cancellationReasonUnreachable: "Не удалось связаться с клиентом",
  approvalConfirmPrompt: "Подтвердить оплату после сверки чека? Запись станет подтверждённой.",
  rejectionConfirmPrompt: "Отклонить чек? Выберите причину отклонения. Решение сохранится в истории записи.",
  rejectionReasonAmount: "Сумма не совпадает",
  rejectionReasonRecipient: "Карта получателя не совпадает",
  rejectionReasonBank: "Оплата не подтверждена банком",
  reviewStateChanged: "Состояние изменилось. Проверьте новый чек перед решением.",
  reviewStateStale: "Состояние изменилось. Показаны актуальные данные.",
  invalidStatusText: "Действие недоступно в текущем состоянии записи. Обновите карточку.",
  slotUnavailableText: "Это время уже занято. Старое время записи сохранено. Выберите другой слот.",
  invalidInputText: "Данные действия устарели или заполнены неверно. Обновите карточку.",
  customerTelegramUnavailableText: "Клиент не привязал Telegram, поэтому напоминание отправить нельзя.",
  paymentInvalidStatusText: "Чек уже обработан. Обновите карточку, чтобы увидеть текущее состояние.",
  paymentInvalidInputText: "Причина должна содержать от 3 до 300 символов.",
  paymentsQueueTitle: "Чеки на проверке",
  paymentsQueueEmpty: "Чеки на проверке\n\nВсе чеки проверены.",
  buttonToday: "Сегодня",
  buttonBookings: "Записи",
  buttonUpcoming: "Ближайшие",
  buttonPending: "Ожидают оплату",
  buttonShowMore: "Показать ещё",
  buttonRefresh: "Обновить",
  buttonOpen: "Открыть",
  buttonBack: "Назад",
  buttonBackToDates: "К датам",
  buttonBackToQueue: "К очереди",
  buttonConfirmBooking: "Подтвердить запись",
  buttonRemindPayment: "Напомнить об оплате",
  buttonReschedule: "Перенести",
  buttonCancelBooking: "Отменить запись",
  buttonShowReceipt: "Показать чек",
  buttonApprovePayment: "Подтвердить оплату",
  buttonRejectReceipt: "Отклонить чек",
  buttonBackToReview: "Назад к проверке",
  buttonConfirmYes: "Да, подтвердить",
  titleTodayBookings: "Записи на сегодня",
  titlePendingBookings: "Ожидают оплату",
  titleUpcomingBookings: "Ближайшие записи",

  // language selection
  languagePrompt: "Выберите язык бота.",
  languageButtonRu: "Русский",
  languageButtonTg: "Тоҷикӣ",
  languageSaved: "Язык переключён на русский.",

  // attention reason labels
  attentionAmountMismatch: "Сумма не совпадает",
  attentionRecipientMismatch: "Карта не совпадает",
  attentionOperationTimeMismatch: "Время операции не совпадает",
  attentionReceiptNotSuccessful: "Оплата неуспешна",
  attentionBookingNotPending: "Статус записи изменился",
  attentionOcrFailed: "Чек не распознан",
  attentionReceiptMismatch: "Данные не совпадают",
  attentionDuplicateOperation: "Операция уже использована",
  attentionNeedsManualReview: "Нужна ручная проверка",

  // booking review status labels
  bookingStatusPendingPayment: "ожидает оплаты",
  bookingStatusConfirmed: "подтверждена",
  bookingStatusCancelled: "отменена",
  bookingStatusExpired: "истекла",
  bookingStatusChanged: "изменилась",

  // payment review status labels
  paymentStatusPending: "ожидает оплаты",
  paymentStatusProcessing: "обрабатывается",
  paymentStatusNeedsAttention: "требует проверки",
  paymentStatusAccepted: "подтверждена",
  paymentStatusRejected: "отклонена",
  paymentStatusChanged: "изменилась",
} as const;

export const botMessagesTg = {
  managedBotCreationDone: "Бизнеси «{business}» пайваст шуд. Танҳо ботеро, ки бизнес ниёз дорад, эҷод кунед — ботии муштарӣ. Он дарҳол аз они шумо мешавад.",
  keyboardCreateCustomerBot: "Сохтани боти муштарӣ",
  keyboardMainMenu: "Менюи асосӣ",
  keyboardCheckReceipts: "Санҷиши чек",
  keyboardSettings: "Танзимот",
  keyboardCustomerLink: "Пайванд барои мизоҷон",
  keyboardMore: "Боз",
  keyboardHelp: "Кӯмак",
  linkInvalidOrExpired: "Пайванди пайвастшавӣ нодуруст ё мӯҳлаташ гузаштааст. Дар кабинети ManClient пайванди нав созед.",
  tokenRejectedDeleted: "Токенҳо дар чат қабул намешаванд. Боти мавҷударо тавассути шакли ҳифзшуда дар кабинети ManClient пайваст кунед.",
  tokenRejectedNotDeleted: "Паёми токенро нест карда нашуд. Онро дастӣ нест кунед, токенро дар @BotFather аз нав бароред ва ботро тавассути шакли ҳифзшуда дар кабинети ManClient пайваст кунед.",
  managedBotCreationForbidden: "Сохтани боти муштарӣ танҳо барои соҳиб ё маъмур дар чати шахсӣ бо @manclient_bot дастрас аст.",
  managedBotCreationPrompt: "Telegram сохтани боти муштариро нишон медиҳад. Бот дарҳол аз они шумо мешавад, ManClient онро худкор пайваст мекунад.",
  managedBotIntentMissing: "Бизнес барои ин бот муайян нашуд. Бизнеси лозимаро дар ManClient кушоед ва сохтанро аз нав оғоз кунед.",
  managedBotFailed: "Бот сохта шуд ва аз они шумост, аммо ManClient ҳоло онро пайваст карда натавонист. Дертар аз нав кӯшиш кунед — сохтани боти нав лозим нест.",
  loginPrompt: "ManClient — ёрдамчӣ барои идораи сабти бизнеси шумо. Барои пайваст кардани ширкат ба кабинет ворид шавед.",
  loginButton: "Ворид ба кабинет",

  bookingsFilterPrompt: "Кадом сабтҳоро нишон диҳам?",
  staleActionText: "Ин амал дигар эътибор надорад. Маълумотро нав кунед ё менюи актуалиро кушоед.",
  staleActionSimpleText: "Ин амал дигар эътибор надорад. Менюи актуалиро кушоед.",
  checksAccessDenied: "Санҷиши чекҳо танҳо барои соҳиб ва маъмур дастрас аст.",
  helpText: "Барои сабтҳо ва рӯзи корӣ менюро истифода баред. Бизнес танҳо як бот месозад — боти муштарӣ; соҳибон ва даста дар ин ҷо, дар @manclient_bot умумӣ кор мекунанд.",
  customerLinkPrompt: "Пайванд барои сабти муштариён:",
  customerLinkButton: "Кушодани сабт",
  receiptPhotoUnavailable: "Акси чек ҳоло дастрас нест. Корти сабтро нав кунед ва бори дигар кӯшиш кунед.",
  bookingConfirmedManual: "Сабт дастӣ тасдиқ шуд. Санҷиши бонкии пардохт гузаронида нашуд.",
  reminderScheduled: "Ёдоварии пардохт ба нақша гирифта шуд.",
  reminderAlreadyScheduled: "Ёдоварии пардохт аллакай ба нақша гирифта шудааст.",
  bookingRescheduled: "Вақти сабт иваз шуд.",
  bookingCancelled: "Сабт бекор карда шуд. Сабаб нигоҳ дошта шуд.",
  paymentApproved: "Пардохт тасдиқ шуд. Сабт тасдиқ шуд.",
  paymentAlreadyApproved: "Пардохт аллакай тасдиқ шудааст. Ҳолати актуалӣ нишон дода шуд.",
  paymentRejected: "Чек рад карда шуд. Сабаб нигоҳ дошта шуд.",
  paymentAlreadyRejected: "Чек аллакай рад карда шудааст. Ҳолати актуалӣ нишон дода шуд.",
  rescheduleDatesPrompt: "Санаи навро интихоб кунед. Вақти кӯҳна то интиқоли муваффақ нигоҳ дошта мешавад.",
  rescheduleDatesEmpty: "Барои 7 рӯзи наздик санаи холӣ нест. Вақти кӯҳнаи сабт нигоҳ дошта шуд.",
  rescheduleSlotsPrompt: "Вақти навро интихоб кунед. Дастрасӣ пеш аз интиқол боз санҷида мешавад.",
  rescheduleSlotsEmpty: "Барои ин сана вақти холӣ дигар нест. Санаи дигарро интихоб кунед.",
  cancellationConfirmPrompt: "Сабтро бекор мекунед? Барои тасдиқи бекоркунӣ сабабро интихоб кунед.",
  cancellationReasonCustomer: "Мизоҷ хоҳиш кард бекор кунад",
  cancellationReasonUnreachable: "Бо мизоҷ алоқа барқарор нашуд",
  approvalConfirmPrompt: "Пас аз санҷиши чек пардохтро тасдиқ мекунед? Сабт тасдиқшуда мешавад.",
  rejectionConfirmPrompt: "Чекро рад мекунед? Сабаби радкуниро интихоб кунед. Қарор дар таърихи сабт нигоҳ дошта мешавад.",
  rejectionReasonAmount: "Маблағ мувофиқ нест",
  rejectionReasonRecipient: "Корти гиранда мувофиқ нест",
  rejectionReasonBank: "Пардохт аз ҷониби бонк тасдиқ нашудааст",
  reviewStateChanged: "Ҳолат тағйир ёфт. Пеш аз қарор чеки навро санҷед.",
  reviewStateStale: "Ҳолат тағйир ёфт. Маълумоти актуалӣ нишон дода шуд.",
  invalidStatusText: "Амал дар ҳолати ҷории сабт дастрас нест. Корти сабтро нав кунед.",
  slotUnavailableText: "Ин вақт аллакай гирифта шудааст. Вақти кӯҳнаи сабт нигоҳ дошта шуд. Слоти дигарро интихоб кунед.",
  invalidInputText: "Маълумоти амал кӯҳна ё нодуруст пур карда шудааст. Корти сабтро нав кунед.",
  customerTelegramUnavailableText: "Мизоҷ Telegram-ро пайваст накардааст, аз ин рӯ ёдоварӣ фиристода намешавад.",
  paymentInvalidStatusText: "Чек аллакай коркард шудааст. Корти сабтро нав кунед, то ҳолати актуалиро бинед.",
  paymentInvalidInputText: "Сабаб бояд аз 3 то 300 ҳарф дошта бошад.",
  paymentsQueueTitle: "Чекҳо дар навбати санҷиш",
  paymentsQueueEmpty: "Чекҳо дар навбати санҷиш\n\nҲамаи чекҳо санҷида шуданд.",
  buttonToday: "Имрӯз",
  buttonBookings: "Сабтҳо",
  buttonUpcoming: "Наздиктарин",
  buttonPending: "Мунтазири пардохт",
  buttonShowMore: "Боз нишон диҳед",
  buttonRefresh: "Нав кардан",
  buttonOpen: "Кушодан",
  buttonBack: "Бозгашт",
  buttonBackToDates: "Ба санаҳо",
  buttonBackToQueue: "Ба навбат",
  buttonConfirmBooking: "Тасдиқи сабт",
  buttonRemindPayment: "Ёдоварии пардохт",
  buttonReschedule: "Ба таъхир гузоштан",
  buttonCancelBooking: "Бекор кардани сабт",
  buttonShowReceipt: "Нишон додани чек",
  buttonApprovePayment: "Тасдиқи пардохт",
  buttonRejectReceipt: "Рад кардани чек",
  buttonBackToReview: "Бозгашт ба санҷиш",
  buttonConfirmYes: "Ҳа, тасдиқ",
  titleTodayBookings: "Сабтҳои имрӯза",
  titlePendingBookings: "Мунтазири пардохт",
  titleUpcomingBookings: "Сабтҳои наздиктарин",

  languagePrompt: "Забони ботро интихоб кунед.",
  languageButtonRu: "Русский",
  languageButtonTg: "Тоҷикӣ",
  languageSaved: "Забон ба тоҷикӣ иваз шуд.",

  attentionAmountMismatch: "Маблағ мувофиқ нест",
  attentionRecipientMismatch: "Корт мувофиқ нест",
  attentionOperationTimeMismatch: "Вақти амалиёт мувофиқ нест",
  attentionReceiptNotSuccessful: "Пардохт бомуваффақият анҷом наёфт",
  attentionBookingNotPending: "Статуси сабт тағйир ёфт",
  attentionOcrFailed: "Чек шинохта нашуд",
  attentionReceiptMismatch: "Маълумот мувофиқ нест",
  attentionDuplicateOperation: "Амалиёт аллакай истифода шудааст",
  attentionNeedsManualReview: "Санҷиши дастӣ лозим аст",

  bookingStatusPendingPayment: "мунтазири пардохт",
  bookingStatusConfirmed: "тасдиқшуда",
  bookingStatusCancelled: "бекоршуда",
  bookingStatusExpired: "мӯҳлаташ гузашта",
  bookingStatusChanged: "тағйирёфта",

  paymentStatusPending: "мунтазири пардохт",
  paymentStatusProcessing: "коркард мешавад",
  paymentStatusNeedsAttention: "санҷиш лозим аст",
  paymentStatusAccepted: "тасдиқшуда",
  paymentStatusRejected: "радшуда",
  paymentStatusChanged: "тағйирёфта",
} as const;

export function botMessage(locale: BotLocale, key: keyof typeof botMessagesRu): string {
  return (locale === "tg" ? botMessagesTg : botMessagesRu)[key];
}

export function resolveBotLocale(actor: { languageCode?: string | null } | null | undefined): BotLocale {
  return actor?.languageCode === "tg" ? "tg" : "ru";
}

export function managedBotConnectedMessage(locale: BotLocale, businessName: string): string {
  return botMessage(locale, "managedBotCreationDone").replace("{business}", businessName);
}

export function customerBotAlreadyConnectedMessage(locale: BotLocale, username?: string): string {
  return locale === "tg"
    ? `Боти муштарӣ${username ? ` @${username}` : ""} аллакай пайваст шудааст.`
    : `Клиентский бот${username ? ` @${username}` : ""} уже подключён.`;
}

export function managedBotConnectedFinalMessage(locale: BotLocale, username: string): string {
  return locale === "tg"
    ? `Боти муштарӣ @${username} пайваст шуд. Он аз они шумост; ManClient танҳо интегратсияро идора мекунад.`
    : `Клиентский бот @${username} подключён. Он принадлежит вам; ManClient управляет только интеграцией.`;
}

export function customerBotStatusLabel(locale: BotLocale, status: "ACTIVE" | "INACTIVE", username?: string | null): string {
  if (status === "ACTIVE") {
    return locale === "tg"
      ? `пайваст шуд${username ? ` (@${username})` : ""}`
      : `подключён${username ? ` (@${username})` : ""}`;
  }
  return locale === "tg" ? "пайваст нашудааст" : "не подключён";
}

export function mainMenuSummaryText(locale: BotLocale, input: {
  businessName: string;
  todayCount: number;
  pendingPaymentCount: number;
  needsAttentionCount: number | null;
  customerBotLabel: string;
}): string {
  return [
    `ManClient · ${input.businessName}`,
    locale === "tg" ? `Имрӯз: ${input.todayCount}` : `Сегодня: ${input.todayCount}`,
    locale === "tg" ? `Мунтазири пардохт: ${input.pendingPaymentCount}` : `Ожидают оплату: ${input.pendingPaymentCount}`,
    ...(input.needsAttentionCount === null ? [] : [
      locale === "tg" ? `Чекҳо дар санҷиш: ${input.needsAttentionCount}` : `Чеки на проверке: ${input.needsAttentionCount}`,
    ]),
    locale === "tg" ? `Боти муштарӣ: ${input.customerBotLabel}` : `Клиентский бот: ${input.customerBotLabel}`,
  ].join("\n");
}

export function openPaymentButtonText(locale: BotLocale, customerName: string): string {
  return locale === "tg" ? `Кушодан · ${customerName}` : `Открыть · ${customerName}`;
}

export function paymentsQueueListText(locale: BotLocale, items: Array<{
  index: number;
  customerName: string;
  serviceName: string;
  amount: string;
  attentionReason: string;
}>): string {
  const title = botMessage(locale, "paymentsQueueTitle");
  return [title, "", ...items.map(item => [
    `${item.index}. ${item.customerName} · ${item.serviceName}`,
    `${item.amount} · ${item.attentionReason}`,
  ].join("\n"))].join("\n\n");
}

export function paymentRejectedNoticeText(locale: BotLocale, reason: string | null): string {
  const base = botMessage(locale, "paymentRejected");
  if (!reason) return base;
  return locale === "tg" ? `${base} Сабаб: ${reason}.` : `${base} Причина: ${reason}.`;
}

export function currentStateBookingNotice(locale: BotLocale, bookingStatusLabel: string, paymentStatusLabel: string): string {
  return locale === "tg"
    ? `Ҳолати ҷорӣ: сабт ${bookingStatusLabel}; пардохт ${paymentStatusLabel}. Қарор оид ба чек дастрас нест.`
    : `Текущее состояние: запись ${bookingStatusLabel}; оплата ${paymentStatusLabel}. Решение по чеку недоступно.`;
}

export function currentStateNoReceiptNotice(locale: BotLocale): string {
  return locale === "tg"
    ? "Ҳолати ҷорӣ: сабт мунтазири пардохт аст; пардохт санҷиш лозим дорад, аммо чеки актуалӣ дар санҷиш нест."
    : "Текущее состояние: запись ожидает оплаты; оплата требует проверки, но актуального чека на проверке нет.";
}

export function currentStatePaymentNotice(locale: BotLocale, paymentStatusLabel: string): string {
  return locale === "tg"
    ? `Ҳолати ҷорӣ: сабт мунтазири пардохт аст; пардохт ${paymentStatusLabel}.`
    : `Текущее состояние: запись ожидает оплаты; оплата ${paymentStatusLabel}.`;
}
