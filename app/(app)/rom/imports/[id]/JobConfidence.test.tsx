import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JobConfidence } from "./JobConfidence";

// LA-2967: a ProEst import's source job shows its estimator confidence score,
// who gave it and when, and offers every score from 1 to 10.
// LA-2992: the form stays closed until Change or Add Score opens it.

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const JESSE = { score: 8, scoredBy: "Jesse Snizek", scoredOn: "2026-10-15" };

describe("JobConfidence", () => {
  it("shows a saved score with the person and date behind it, and no form", () => {
    const html = renderToStaticMarkup(
      <JobConfidence projectId={PROJECT_ID} projectName="Avalon, Melville" initial={JESSE} />,
    );
    expect(html).toContain("Estimator Confidence, Avalon, Melville");
    expect(html).toContain("8 of 10");
    expect(html).toContain("Scored by Jesse Snizek, Oct 15, 2026");
    expect(html).toContain(">Change</button>");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Save Score");
  });

  it("reads Not Scored for a job nobody has scored, with Add Score and no form", () => {
    const html = renderToStaticMarkup(
      <JobConfidence projectId={PROJECT_ID} projectName="Poco Loco" initial={null} />,
    );
    expect(html).toContain("Not Scored");
    expect(html).not.toContain("Scored by");
    expect(html).toContain(">Add Score</button>");
    expect(html).not.toContain("<select");
  });

  it("opens the form on the saved values, with every score, Save Score off until something changes, and Cancel", () => {
    const html = renderToStaticMarkup(
      <JobConfidence projectId={PROJECT_ID} projectName="Avalon, Melville" initial={JESSE} initialEditing />,
    );
    expect(html).toContain('value="Jesse Snizek"');
    expect(html).toContain('value="2026-10-15"');
    expect(html).toContain('<option value="">Not Scored</option>');
    for (const score of [1, 10]) expect(html).toContain(`<option value="${score}">${score} of 10</option>`);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save Score<\/button>/);
    expect(html).toContain(">Cancel</button>");
    expect(html).not.toContain(">Change</button>");
  });

  it("opens an empty form on an unscored job, with the person and date fields off", () => {
    const html = renderToStaticMarkup(
      <JobConfidence projectId={PROJECT_ID} projectName="Poco Loco" initial={null} initialEditing />,
    );
    expect(html).toContain("<select");
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
