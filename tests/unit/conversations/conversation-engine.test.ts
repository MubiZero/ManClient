import { describe, expect, it } from "vitest";

import {
  transitionConversationState,
  type ConversationState,
} from "@/core/conversations/conversation-state";
import { conversationMessage } from "@/core/conversations/conversation-engine";

describe("booking conversation state machine", () => {
  it.each([
    ["LANGUAGE", "SELECT_LANGUAGE", { locale: "ru" }, "BRANCH"],
    ["BRANCH", "SELECT_BRANCH", { branchId: "branch-1" }, "SERVICE"],
    ["SERVICE", "SELECT_SERVICE", { serviceId: "service-1" }, "STAFF"],
    ["STAFF", "SELECT_STAFF", { staffId: "staff-1" }, "DATE"],
    ["DATE", "SELECT_DATE", { date: "2026-08-02" }, "SLOT"],
    ["SLOT", "SELECT_SLOT", { startsAt: "2026-08-02T05:00:00.000Z" }, "CUSTOMER_NAME"],
    ["CUSTOMER_NAME", "ENTER_NAME", { name: "Мухаммад" }, "CUSTOMER_PHONE"],
    ["CUSTOMER_PHONE", "ENTER_PHONE", { phone: "+992900001122" }, "CONFIRM"],
    ["CONFIRM", "CONFIRM_BOOKING", {}, "AWAITING_PAYMENT"],
    ["AWAITING_PAYMENT", "PAYMENT_SUBMITTED", {}, "AWAITING_RECEIPT"],
    ["AWAITING_RECEIPT", "RECEIPT_ACCEPTED", {}, "COMPLETE"],
  ] as const)("moves %s with %s to %s", (state, kind, payload, expected) => {
    const result = transitionConversationState({ state, data: {} } as ConversationState, { kind, payload });
    expect(result.state).toBe(expected);
  });

  it("rejects an action that does not belong to the current state", () => {
    expect(() => transitionConversationState(
      { state: "LANGUAGE", data: {} },
      { kind: "SELECT_SLOT", payload: { startsAt: "2026-08-02T05:00:00.000Z" } },
    )).toThrow("Conversation command is not allowed in LANGUAGE");
  });

  it("validates phone, dates, names, and identifiers before storing them", () => {
    expect(() => transitionConversationState(
      { state: "CUSTOMER_PHONE", data: {} },
      { kind: "ENTER_PHONE", payload: { phone: "900001122" } },
    )).toThrow();
    expect(() => transitionConversationState(
      { state: "DATE", data: {} },
      { kind: "SELECT_DATE", payload: { date: "02.08.2026" } },
    )).toThrow();
  });

  it("provides complete Russian and Tajik messages without copying Russian", () => {
    const russian = conversationMessage("ru", "CUSTOMER_PHONE");
    const tajik = conversationMessage("tg", "CUSTOMER_PHONE");

    expect(russian).toContain("+992");
    expect(tajik).toContain("+992");
    expect(tajik).not.toBe(russian);
    expect(tajik).toContain("Рақами телефон");
  });
});
