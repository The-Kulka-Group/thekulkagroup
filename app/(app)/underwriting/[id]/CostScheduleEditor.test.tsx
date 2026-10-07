import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { UnderwritingCase } from "@/lib/underwriting/cases";
import { CostScheduleEditor } from "./CostScheduleEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const savedCase = {
  id: "case-1",
  caseRevision: 2,
  costSchedule: {
    analysisStartMonth: "2026-01",
    saleMonth: "2027-12",
    saleAnchor: { milestoneId: "sale", offsetMonths: 0 },
    milestones: [
      { id: "construction-start", name: "Construction Start", month: "2026-03" },
      { id: "sale", name: "Sale", month: "2027-12" },
    ],
    costLines: [],
  },
} as unknown as UnderwritingCase;

describe("cost schedule editor milestones", () => {
  const html = renderToStaticMarkup(<CostScheduleEditor savedCase={savedCase} />);

  it("names each milestone's month input for the milestone, apart from the typed sale month", () => {
    expect(html).toContain('aria-label="Sale milestone month"');
    expect(html).toContain('aria-label="Construction Start milestone month"');
    // The sale date is anchored here, so its own input is the offset, never another "Sale month".
    expect(html.match(/aria-label="Sale month"/g)).toBeNull();
    expect(html).toContain('aria-label="Sale offset in months"');
  });

  it("keeps the typed sale month input's own name when the sale is typed", () => {
    const typed = renderToStaticMarkup(<CostScheduleEditor savedCase={{ ...savedCase, costSchedule: { ...savedCase.costSchedule!, saleAnchor: undefined } } as UnderwritingCase} />);
    expect(typed.match(/aria-label="Sale month"/g)).toHaveLength(1);
    expect(typed).toContain('aria-label="Sale milestone month"');
  });
});
