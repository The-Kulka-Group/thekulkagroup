import { describe, expect, it } from "vitest";

import { resolveGateItems, type BranchGateItemRule } from "./rom-gates";

// LA-1028: the map from a branch gate's answer to the one canonical item it
// switches on or off. Matt's semantics, 2026-09-24, one case each.

function rule(over: Partial<BranchGateItemRule> = {}): BranchGateItemRule {
  return {
    costCode: "1",
    section: "demolition",
    requiresAllSections: [],
    closesOn: ["no"],
    statedBy: "mnicosia@thekulkagroup.com",
    statedOn: "2026-09-24",
    reason: "synthetic",
    ...over,
  };
}

describe("resolveGateItems: one-section rules", () => {
  it("prices the item on yes", () => {
    const resolved = resolveGateItems([rule()], { demolition: "yes" });
    expect(resolved.get("1")?.status).toBe("priced");
  });

  it("removes the item, not in this job, on no", () => {
    const resolved = resolveGateItems([rule()], { demolition: "no" });
    expect(resolved.get("1")?.status).toBe("not_in_job");
  });

  it("shows the item as TBD on don't know", () => {
    const resolved = resolveGateItems([rule()], { demolition: "dont_know" });
    expect(resolved.get("1")?.status).toBe("tbd");
  });

  it("assumes the item present when nobody answered", () => {
    const resolved = resolveGateItems([rule()], {});
    expect(resolved.get("1")?.status).toBe("assumed_present");
  });

  it("carries the sections it read, for the ROM's own words", () => {
    const resolved = resolveGateItems([rule({ section: "amenity_scope" })], { amenity_scope: "no" });
    expect(resolved.get("1")?.sections).toEqual(["amenity_scope"]);
  });
});

describe("resolveGateItems: parking, a non-yes/no closesOn set", () => {
  const parkingRule = rule({ costCode: "3", section: "parking_type", closesOn: ["none", "surface"] });

  it("closes the item for none or surface", () => {
    expect(resolveGateItems([parkingRule], { parking_type: "none" }).get("3")?.status).toBe("not_in_job");
    expect(resolveGateItems([parkingRule], { parking_type: "surface" }).get("3")?.status).toBe("not_in_job");
  });

  it("prices the item for structured or underground", () => {
    expect(resolveGateItems([parkingRule], { parking_type: "structured" }).get("3")?.status).toBe("priced");
    expect(resolveGateItems([parkingRule], { parking_type: "underground" }).get("3")?.status).toBe(
      "priced",
    );
  });

  it("shows TBD for don't know", () => {
    expect(resolveGateItems([parkingRule], { parking_type: "dont_know" }).get("3")?.status).toBe("tbd");
  });

  it("assumes present when parking was never answered", () => {
    expect(resolveGateItems([parkingRule], {}).get("3")?.status).toBe("assumed_present");
  });
});

describe("resolveGateItems: item 34a's two-question rule", () => {
  const item34a = rule({
    costCode: "34a",
    section: "levels_below_grade",
    requiresAllSections: ["site_conditions"],
    closesOn: ["no"],
  });

  it("closes the item only when both sections are no", () => {
    const resolved = resolveGateItems(
      [item34a],
      { levels_below_grade: "no", site_conditions: "no" },
    );
    expect(resolved.get("34a")?.status).toBe("not_in_job");
  });

  it("prices the item when either section is yes", () => {
    expect(
      resolveGateItems([item34a], { levels_below_grade: "yes", site_conditions: "no" }).get("34a")
        ?.status,
    ).toBe("priced");
    expect(
      resolveGateItems([item34a], { levels_below_grade: "no", site_conditions: "yes" }).get("34a")
        ?.status,
    ).toBe("priced");
    expect(
      resolveGateItems([item34a], { levels_below_grade: "yes", site_conditions: "yes" }).get("34a")
        ?.status,
    ).toBe("priced");
  });

  it("shows TBD when one section is no and the other is don't know", () => {
    expect(
      resolveGateItems([item34a], { levels_below_grade: "no", site_conditions: "dont_know" }).get(
        "34a",
      )?.status,
    ).toBe("tbd");
    expect(
      resolveGateItems([item34a], { levels_below_grade: "dont_know", site_conditions: "no" }).get(
        "34a",
      )?.status,
    ).toBe("tbd");
  });

  it("shows TBD when both sections are don't know", () => {
    expect(
      resolveGateItems([item34a], {
        levels_below_grade: "dont_know",
        site_conditions: "dont_know",
      }).get("34a")?.status,
    ).toBe("tbd");
  });

  it("assumes present when either section was never answered and neither is yes", () => {
    expect(resolveGateItems([item34a], { levels_below_grade: "no" }).get("34a")?.status).toBe(
      "assumed_present",
    );
    expect(resolveGateItems([item34a], { site_conditions: "dont_know" }).get("34a")?.status).toBe(
      "assumed_present",
    );
    expect(resolveGateItems([item34a], {}).get("34a")?.status).toBe("assumed_present");
  });

  it("prices the item when it is answered yes but the other section is entirely unanswered", () => {
    expect(resolveGateItems([item34a], { levels_below_grade: "yes" }).get("34a")?.status).toBe(
      "priced",
    );
  });

  it("carries both sections it read", () => {
    expect(
      resolveGateItems([item34a], { levels_below_grade: "no", site_conditions: "no" }).get("34a")
        ?.sections,
    ).toEqual(["levels_below_grade", "site_conditions"]);
  });
});

describe("resolveGateItems: several rules", () => {
  it("resolves one row per cost code, unaffected by the others", () => {
    const resolved = resolveGateItems(
      [rule({ costCode: "1", section: "demolition" }), rule({ costCode: "25", section: "amenity_scope" })],
      { demolition: "no", amenity_scope: "yes" },
    );
    expect(resolved.get("1")?.status).toBe("not_in_job");
    expect(resolved.get("25")?.status).toBe("priced");
  });

  it("keeps an item in only as far as every rule on it lets it in (LA-2219)", () => {
    const deck = [
      rule({ costCode: "11", section: "balconies" }),
      rule({ costCode: "11", section: "balconyType", closesOn: ["juliet"] }),
    ];
    const status = (answers: Record<string, string>) => resolveGateItems(deck, answers).get("11")?.status;
    expect(status({ balconies: "yes", balconyType: "full" })).toBe("priced");
    expect(status({ balconies: "yes", balconyType: "juliet" })).toBe("not_in_job");
    expect(status({ balconies: "no" })).toBe("not_in_job");
    expect(status({ balconies: "dont_know" })).toBe("tbd");
    expect(status({ balconies: "yes" })).toBe("assumed_present");
    expect(resolveGateItems(deck, { balconies: "yes", balconyType: "juliet" }).get("11")?.sections).toEqual(["balconyType"]);
  });

  it("leaves a cost code with no rule unresolved", () => {
    const resolved = resolveGateItems([rule({ costCode: "1" })], { demolition: "no" });
    expect(resolved.has("2")).toBe(false);
  });
});
