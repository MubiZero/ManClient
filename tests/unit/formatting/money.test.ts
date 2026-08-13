import { describe, expect, it } from "vitest";

import { formatSomoni, parseSomoniToDiram } from "@/core/formatting/money";

describe("money formatting", () => {
  it("parses dot and comma decimal somoni values into diram", () => {
    expect(parseSomoniToDiram("50,25")).toBe(5_025);
    expect(parseSomoniToDiram(" 50.2 ")).toBe(5_020);
  });

  it("rejects zero, negative and over-precise amounts", () => {
    for (const value of ["0", "-1", "10.001", "not-money"]) {
      expect(() => parseSomoniToDiram(value)).toThrowError("INVALID_AMOUNT");
    }
  });

  it("names the currency the way people say it, not the way banks code it", () => {
    // «TJS» is a banking code; a customer checking a sum before a transfer reads it as a foreign
    // abbreviation, and this number is shown to customers.
    expect(formatSomoni(5_025, "ru-TJ")).toBe("50,25\u00a0сомони");
    expect(formatSomoni(5_025, "tg-TJ")).toBe("50,25\u00a0сомонӣ");
    expect(formatSomoni(5_025)).not.toContain("TJS");
  });
});
