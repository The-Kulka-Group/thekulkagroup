import { describe, expect, it } from "vitest";

import { sectionsAwaitingFollowUps } from "./preview";
import { tier1Flow } from "./question-flow";

// Matt, 2026-09-27: the live budget priced demolition on the yes alone,
// before any question about the building. A section answered yes waits
// until every follow-up it opened is answered.

const base = { project_type: "multifamily", construction_kind: "new", gross_square_feet: "120000" };

describe("sectionsAwaitingFollowUps", () => {
  it("holds demolition on a yes until its structure questions are answered", () => {
    const flow = tier1Flow();
    expect(sectionsAwaitingFollowUps(flow, { ...base, demolition: "yes" }).has("demolition")).toBe(true);
    expect(
      sectionsAwaitingFollowUps(flow, { ...base, demolition: "yes", demolition_structure_count: "2" }).has("demolition"),
    ).toBe(true);
    expect(
      sectionsAwaitingFollowUps(flow, {
        ...base,
        demolition: "yes",
        demolition_structure_count: "2",
        demolition_structure_square_feet: "8000",
        demolition_structure_type: flow.questions.find((q) => q.id === "demolition_structure_type")!.choices![0].value,
      }).has("demolition"),
    ).toBe(false);
  });

  it("releases demolition when no structures come down, since nothing further opens", () => {
    const flow = tier1Flow();
    expect(
      sectionsAwaitingFollowUps(flow, { ...base, demolition: "yes", demolition_structure_count: "0" }).has("demolition"),
    ).toBe(false);
  });

  it("holds nothing for a no or an unanswered gate", () => {
    const flow = tier1Flow();
    expect(sectionsAwaitingFollowUps(flow, { ...base, demolition: "no" }).size).toBe(0);
    expect(sectionsAwaitingFollowUps(flow, base).size).toBe(0);
  });
});
