import { describe, expect, it } from "vitest";
import { caretAfterFormat, countSignificant, formatGroupedNumber, parseGroupedNumber } from "./grouped-number";

describe("formatGroupedNumber", () => {
  it("groups the whole part in threes", () => {
    expect(formatGroupedNumber("2557800")).toBe("2,557,800");
    expect(formatGroupedNumber("999")).toBe("999");
    expect(formatGroupedNumber("1000")).toBe("1,000");
    expect(formatGroupedNumber("")).toBe("");
  });

  it("keeps the fraction and a trailing point as typed", () => {
    expect(formatGroupedNumber("1234.50")).toBe("1,234.50");
    expect(formatGroupedNumber("1234.")).toBe("1,234.");
    expect(formatGroupedNumber(".5")).toBe(".5");
  });

  it("keeps a sign", () => {
    expect(formatGroupedNumber("-1234567")).toBe("-1,234,567");
    expect(formatGroupedNumber("-")).toBe("-");
  });
});

describe("parseGroupedNumber", () => {
  it("returns the plain number a field stores", () => {
    expect(parseGroupedNumber("2,557,800")).toBe("2557800");
    expect(parseGroupedNumber("1,234.50")).toBe("1234.50");
    expect(parseGroupedNumber("")).toBe("");
  });

  it("rejects text that is not a number", () => {
    expect(parseGroupedNumber("12a")).toBeUndefined();
    expect(parseGroupedNumber("1.2.3")).toBeUndefined();
    expect(parseGroupedNumber("1e5")).toBeUndefined();
  });
});

describe("caret", () => {
  it("stays after the same digits when a separator appears", () => {
    const formatted = formatGroupedNumber("1234");
    expect(caretAfterFormat(formatted, countSignificant("1234", 4))).toBe(5);
  });

  it("follows a digit typed in the middle", () => {
    const typed = "1,2934";
    const formatted = formatGroupedNumber(parseGroupedNumber(typed)!);
    expect(formatted).toBe("12,934");
    expect(caretAfterFormat(formatted, countSignificant(typed, 4))).toBe(4);
  });
});
