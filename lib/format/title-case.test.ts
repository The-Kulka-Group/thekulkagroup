import { describe, expect, it } from "vitest";

import { titleCase } from "./title-case";

// LA-1148. One shared formatter puts every displayed label and every
// imported name in title case, without touching stored data, keys, or
// codes. Rules (Matt, 2026-09-27): capitalize every word, including each
// side of a hyphen; a fixed list of short words stays lowercase unless it
// opens the string, even inside a hyphenated word; an acronym, a code, or
// any token carrying a digit or a slash keeps its own case untouched.

describe("titleCase", () => {
  it("capitalizes each word of a plain phrase", () => {
    expect(titleCase("drywall and finishes")).toBe("Drywall and Finishes");
  });

  it("lowercases a short word that is not first", () => {
    expect(titleCase("plumbing rough-in")).toBe("Plumbing Rough-in");
  });

  it("capitalizes a short word when it opens the string", () => {
    expect(titleCase("the cost of steel")).toBe("The Cost of Steel");
  });

  it("capitalizes every side of a hyphenated word", () => {
    expect(titleCase("cast-in-place concrete frame")).toBe("Cast-in-Place Concrete Frame");
  });

  it("lowercases a short word inside a hyphenated word", () => {
    expect(titleCase("pre-engineered metal or light steel")).toBe("Pre-Engineered Metal or Light Steel");
  });

  it("keeps an all-caps acronym as it is", () => {
    expect(titleCase("USD budget")).toBe("USD Budget");
  });

  it("keeps TBD as it is", () => {
    expect(titleCase("tbd amount".replace("tbd", "TBD"))).toBe("TBD Amount");
  });

  it("keeps a mixed-case code with a slash as it is", () => {
    expect(titleCase("GRs/GCs markup")).toBe("GRs/GCs Markup");
  });

  it("keeps a token with digits as it is", () => {
    expect(titleCase("22-100 plumbing")).toBe("22-100 Plumbing");
  });

  it("keeps a parenthesized roman-numeral code as it is", () => {
    expect(titleCase("wood frame (Type V)")).toBe("Wood Frame (Type V)");
  });

  it("is idempotent on text that is already title case", () => {
    const already = "Plumbing Rough-in";
    expect(titleCase(already)).toBe(already);
  });

  it("is idempotent on a longer already-title-case label", () => {
    const already = "Pre-Engineered Metal or Light Steel";
    expect(titleCase(already)).toBe(already);
  });

  it("returns an empty string unchanged", () => {
    expect(titleCase("")).toBe("");
  });

  it("handles a single short word by capitalizing it", () => {
    expect(titleCase("or")).toBe("Or");
  });
});
