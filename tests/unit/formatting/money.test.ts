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

  it("formats diram as TJS for the selected locale", () => {
    expect(formatSomoni(5_025, "ru-TJ")).toMatch(/50[,.]25\s*TJS/);
  });
});
