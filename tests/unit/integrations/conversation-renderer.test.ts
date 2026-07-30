import { describe, expect, it } from "vitest";

import { inlineButtonGrid } from "@/integrations/telegram/conversation-renderer";

describe("customer conversation keyboard renderer", () => {
  it("keeps short date choices compact while leaving navigation in separate rows", () => {
    const keyboard = inlineButtonGrid([
      { text: "Сегодня", callbackData: "today" },
      { text: "Завтра", callbackData: "tomorrow" },
      { text: "1 августа", callbackData: "day-1" },
      { text: "2 августа", callbackData: "day-2" },
    ], 2, [
      [{ text: "‹ Назад", callbackData: "back" }],
      [{ text: "В меню", callbackData: "home" }],
    ]);

    expect(keyboard.inline_keyboard).toEqual([
      [{ text: "Сегодня", callback_data: "today" }, { text: "Завтра", callback_data: "tomorrow" }],
      [{ text: "1 августа", callback_data: "day-1" }, { text: "2 августа", callback_data: "day-2" }],
      [{ text: "‹ Назад", callback_data: "back" }],
      [{ text: "В меню", callback_data: "home" }],
    ]);
  });

  it("fits short time slots in three columns", () => {
    const keyboard = inlineButtonGrid([
      { text: "09:00", callbackData: "09" },
      { text: "09:30", callbackData: "0930" },
      { text: "10:00", callbackData: "10" },
      { text: "10:30", callbackData: "1030" },
    ], 3);

    expect(keyboard.inline_keyboard).toEqual([
      [{ text: "09:00", callback_data: "09" }, { text: "09:30", callback_data: "0930" }, { text: "10:00", callback_data: "10" }],
      [{ text: "10:30", callback_data: "1030" }],
    ]);
  });
});
