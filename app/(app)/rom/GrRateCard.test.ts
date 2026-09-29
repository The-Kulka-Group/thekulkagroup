import { describe, expect, it } from "vitest";

import type { GrRate } from "@/lib/rom/gr-rates";

import { grRateLabel } from "./GrRateCard";

const base: GrRate = {
  id: "x",
  section: "Site Controls",
  item: "Item",
  unit: "SF",
  basis: "unit",
  phase: null,
  rate: 0.55,
  jobQuantity: null,
  note: null,
  flaggedFor: null,
  priceable: true,
  notPriceableReason: null,
  sourceEstimate: "C-00379",
  sourceJob: "one warehouse",
  singleJobWarehouse: true,
};

describe("grRateLabel", () => {
  it("says the basis in words", () => {
    expect(grRateLabel(base)).toBe("$0.55 per SF");
    expect(grRateLabel({ ...base, basis: "phase_weeks", rate: 1400 })).toBe("$1,400 per week");
    expect(grRateLabel({ ...base, basis: "lump_sum", rate: 1500 })).toBe("$1,500 lump sum");
  });

  it("shows No Rate for a line without one and Not Priceable for insurance", () => {
    expect(grRateLabel({ ...base, rate: null })).toBe("No Rate");
    expect(grRateLabel({ ...base, rate: null, priceable: false })).toBe("Not Priceable");
  });
});
