import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { UnderwritingReview } from "@/lib/underwriting/presentation";

import { ReviewList } from "./ReviewList";
import { RemountOnReviewDone } from "./review-epoch";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const review: UnderwritingReview = {
  calculation: [{ id: "calculation-current-revision", message: "This project has not been calculated.", severity: "waiting" }],
  groups: [{
    key: "costs",
    title: "Development Cost Schedule",
    workingCount: 1,
    rows: [{ id: "cost-land", label: "Land Purchase", gaps: ["No Source Date", "Working on It"], message: "Land Purchase: No Source Date, Working on It" }],
  }, {
    key: "facts",
    title: "Project Facts",
    workingCount: 0,
    rows: [{ id: "fact-proposedUnits", label: "Proposed Units", gaps: ["No Source Date"], message: "Proposed Units: No Source Date" }],
  }],
  count: 3,
};

describe("ReviewList", () => {
  it("renders calculation issues, then one collapsed group per section with its count", () => {
    const html = renderToStaticMarkup(<ReviewList caseId="c" caseRevision={3} review={review} />);
    expect(html.indexOf("has not been calculated")).toBeLessThan(html.indexOf("Development Cost Schedule"));
    expect(html).toContain("Land Purchase: No Source Date, Working on It");
    expect(html).not.toContain("<details open");
    expect(html.match(/<details/g)).toHaveLength(2);
  });

  it("offers Mark Section Done only where a section has a Working on It row", () => {
    const html = renderToStaticMarkup(<ReviewList caseId="c" caseRevision={3} review={review} />);
    expect(html.match(/Mark Section Done/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Mark Development Cost Schedule Done"');
  });

  it("shows the refreshed review when it gets new props", () => {
    const refreshed: UnderwritingReview = { ...review, groups: [review.groups[1]!], count: 2 };
    const html = renderToStaticMarkup(<ReviewList caseId="c" caseRevision={4} review={refreshed} />);
    expect(html).not.toContain("Land Purchase");
    expect(html).not.toContain("Mark Section Done");
  });
});

describe("RemountOnReviewDone", () => {
  it("renders its editor", () => {
    expect(renderToStaticMarkup(<RemountOnReviewDone sections={["costs"]}><p>Editor</p></RemountOnReviewDone>)).toContain("Editor");
  });
});
