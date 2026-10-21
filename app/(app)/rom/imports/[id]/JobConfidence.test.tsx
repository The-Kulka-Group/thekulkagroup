import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JobConfidence } from "./JobConfidence";

// LA-2967: a ProEst import's source job shows its estimator confidence score,
// who gave it and when, and offers every score from 1 to 10.

describe("JobConfidence", () => {
  it("shows a saved score with the person and date behind it", () => {
    const html = renderToStaticMarkup(
      <JobConfidence
        projectId="00000000-0000-4000-8000-000000000001"
        projectName="Avalon, Melville"
        initial={{ score: 8, scoredBy: "Jesse Snizek", scoredOn: "2026-10-15" }}
      />,
    );
    expect(html).toContain("Estimator Confidence, Avalon, Melville");
    expect(html).toContain("8 of 10");
    expect(html).toContain("Scored by Jesse Snizek, Oct 15, 2026");
    expect(html).toContain('value="Jesse Snizek"');
    for (const score of [1, 10]) expect(html).toContain(`<option value="${score}">${score} of 10</option>`);
  });

  it("reads Not Scored for a job nobody has scored, with the person and date fields off", () => {
    const html = renderToStaticMarkup(
      <JobConfidence projectId="00000000-0000-4000-8000-000000000001" projectName="Poco Loco" initial={null} />,
    );
    expect(html).toContain("Not Scored");
    expect(html).not.toContain("Scored by");
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
