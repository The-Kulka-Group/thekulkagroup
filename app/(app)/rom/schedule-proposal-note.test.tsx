import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ScheduleProposal } from "@kulka/engine";

import type { MarkupOptions } from "@/lib/rom/markup";

import { initialMarkupForm } from "./Markups";
import { ResourcePlanEditor, ScheduleProposalNote } from "./ResourcePlanEditor";
import { TYPED } from "./resource-plan-form";

// LA-1399: the proposed schedule on the Allocated Resources plan. The job is
// synthetic, numbered TEST-.

const options: MarkupOptions = {
  staffingRates: [],
  fieldOfficeRates: [],
  feeRate: null,
  insuranceRate: null,
  historyCounts: { both: 0, gc_only: 0, gr_only: 0 },
};

const phase = (weeks: number | null, reason: string) => ({ weeks, jobNumbers: weeks === null ? [] : ["TEST-0001"], reason });
const proposal: ScheduleProposal = {
  status: "proposed",
  phases: {
    precon: phase(12, "Matches TEST-0001's precon."),
    construction: phase(62, "A little longer for the added area."),
    closeout: phase(null, "No close-out recorded close enough."),
  },
  jobs: [{ jobNumber: "TEST-0001", name: "Synthetic Test Job", why: "Same type and kind, a fifth larger." }],
  reasoning: "One close job.",
  model: "claude-opus-5",
  proposedAt: "2026-09-29",
  inputKey: "v1-test",
};

const noop = () => {};

describe("the proposed schedule on the plan", () => {
  it("is labeled a planning assumption and names each job compared and why", () => {
    const html = renderToStaticMarkup(<ScheduleProposalNote schedule={{ kind: "ready", proposal }} />);
    expect(html).toContain("Proposed Schedule, a Planning Assumption");
    expect(html).toContain("It is not a schedule.");
    expect(html).toContain("TEST-0001</span>, Synthetic Test Job. Same type and kind, a fifth larger.");
    expect(html).toContain("62 weeks. A little longer for the added area.");
    expect(html).toContain("Left for you. No close-out recorded close enough.");
  });

  it("names no model and says nothing about drawings", () => {
    const html = renderToStaticMarkup(<ScheduleProposalNote schedule={{ kind: "ready", proposal }} />);
    expect(html).not.toMatch(/claude|opus|anthropic/i);
    expect(html).not.toMatch(/drawing|takeoff/i);
  });

  it("says so when no job is recorded, and when the proposal failed", () => {
    const empty: ScheduleProposal = {
      ...proposal,
      status: "no_jobs",
      reasoning: "No completed job is recorded yet, so there is nothing to compare this project with. Enter the weeks.",
    };
    expect(renderToStaticMarkup(<ScheduleProposalNote schedule={{ kind: "ready", proposal: empty }} />)).toContain(
      "No completed job is recorded yet",
    );
    expect(
      renderToStaticMarkup(<ScheduleProposalNote schedule={{ kind: "failed", error: "The weeks could not be proposed. Enter them." }} />),
    ).toContain("The weeks could not be proposed.");
  });

  it("tags proposed weeks, and offers a reset on a phase the estimator changed", () => {
    const form = initialMarkupForm(options, null, proposal);
    const plan = { ...form.plan, weeks: { ...form.plan.weeks, construction: "70" }, weeksFrom: { ...form.plan.weeksFrom, construction: TYPED } };
    const html = renderToStaticMarkup(
      <ResourcePlanEditor
        options={options}
        plan={plan}
        onChange={noop}
        disabled={false}
        lineName="General Conditions"
        schedule={{ kind: "ready", proposal }}
      />,
    );
    expect(html).toContain("Proposed</span>");
    expect(html).toContain("Reset to 62 Weeks");
    // Close-out was left blank, so it asks for weeks and offers no reset.
    expect(html).toContain('placeholder="Enter Weeks"');
    expect(html.match(/Reset to/g)).toHaveLength(1);
  });
});
