import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MilestoneAnchorField } from "./MilestoneAnchorField";

const milestones = [
  { id: "construction-start", name: "Construction Start", month: "2026-03" },
  { id: "sale", name: "Sale", month: "2027-12" },
];

function render(anchor: Parameters<typeof MilestoneAnchorField>[0]["anchor"], extra: Partial<Parameters<typeof MilestoneAnchorField>[0]> = {}) {
  return renderToStaticMarkup(
    <MilestoneAnchorField id="line-0-start" label="Hard Cost start" month="2026-04" onMonthChange={() => undefined}
      anchor={anchor} onAnchorChange={() => undefined} milestones={milestones} {...extra} />,
  );
}

describe("milestone anchor field", () => {
  it("shows a month input for a typed month and lists the milestones", () => {
    const html = render(undefined);
    expect(html).toContain('type="month"');
    expect(html).toContain('value="2026-04"');
    expect(html).toContain("Typed Month");
    expect(html).toContain("Construction Start");
    expect(html).not.toContain("Months After Start");
  });

  it("shows the offset and the month it resolves to for a milestone anchor", () => {
    const html = render({ milestoneId: "construction-start", offsetMonths: -2 });
    expect(html).toContain('aria-label="Hard Cost start offset in months"');
    expect(html).toContain('value="-2"');
    expect(html).toContain("Months From, 2026-01");
  });

  it("offers a duration only where the field allows it", () => {
    expect(render(undefined, { allowDuration: true })).toContain("Months After Start");
    const html = render({ durationMonths: 12 }, { allowDuration: true });
    expect(html).toContain('aria-label="Hard Cost start duration in months"');
    expect(html).toContain("Counting the Start Month");
  });

  it("flags an anchor whose milestone is gone and links the error to the control", () => {
    const html = render({ milestoneId: "removed", offsetMonths: 0 }, { errors: [undefined, "The milestone is not on this case."] });
    expect(html).toContain("Missing Milestone");
    expect(html).toContain("No Month Yet");
    expect(html).toContain('aria-describedby="line-0-start-error"');
    expect(html).toContain('role="alert"');
  });
});
