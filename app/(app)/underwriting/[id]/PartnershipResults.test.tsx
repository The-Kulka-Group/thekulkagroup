import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PARTNERSHIP_INPUT_VERSION, runPartnershipWaterfall, type PartnershipPlan } from "@kulka/engine";

import { PartnershipResults } from "./PartnershipResults";
import { PartnershipSection } from "./PartnershipSection";

const working = { reviewState: "working" as const };
const plan: PartnershipPlan = {
  partnershipInputVersion: PARTNERSHIP_INPUT_VERSION,
  lpFundingSharePercent: 90,
  fundingOrder: "pari_passu",
  lpEntryMonth: "2026-02",
  preferredReturn: { ratePercent: 8, accrual: "compound_monthly" },
  tiers: [{ lpIrrHurdlePercent: 12, promotePercent: 20, lpBaseSharePercent: 90 }],
  finalSplit: { promotePercent: 40, lpBaseSharePercent: 90 },
  partnershipEvidence: { funding: working, preferredReturn: working, promoteTiers: working },
};

const months = [-600_000, -400_000, 0, 1_800_000].map((amount, index) => ({
  month: `2026-0${index + 1}`,
  date: ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"][index],
  leveredCashFlow: amount,
  equityContribution: Math.max(-amount, 0),
}));

describe("partnership waterfall views", () => {
  it("shows LP and GP returns, each tier, the traces and the active months", () => {
    const html = renderToStaticMarkup(<PartnershipResults result={runPartnershipWaterfall(months, plan).result!} />);
    for (const text of ["LP XIRR", "GP Promote", "Preferred Return Accrued", "Tier 1", "Final Split", "Partnership Formula Traces", "2026-04", "with the LP entering 2026-02"]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("<th scope=\"row\" class=\"num\">2026-03</th>");
  });

  it("offers the terms with a row per tier and the LP share each tier leaves", () => {
    const html = renderToStaticMarkup(<PartnershipSection partnership={plan} setPartnership={() => undefined} fieldErrors={{ "partnership.tiers.0.promotePercent": "Promote must be from 0 to less than 100 percent." }} />);
    expect(html).toContain("Tier 1");
    expect(html).toContain("72%");
    expect(html).toContain("54%");
    expect(html).toContain("Promote must be from 0 to less than 100 percent.");
    expect(html).toContain("Preferred Return");
    expect(html).toContain('value="2026-02"');
  });

  it("shows only the switch when the case has no waterfall", () => {
    const html = renderToStaticMarkup(<PartnershipSection partnership={undefined} setPartnership={() => undefined} fieldErrors={{}} />);
    expect(html).toContain("Add Partnership Waterfall");
    expect(html).not.toContain("IRR Hurdle Tiers");
  });
});
