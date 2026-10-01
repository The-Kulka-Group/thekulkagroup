import { describe, expect, it } from "vitest";

import {
  SYNTHETIC_JOBS,
  SYNTHETIC_MIDRISE,
  SYNTHETIC_STORAGE,
  SYNTHETIC_TOWER,
} from "./fixtures/synthetic-completed-jobs";
import type { PlanFigure, SchedulePhase } from "./resource-plan";
import {
  applyScheduleProposal,
  closeEnoughJobs,
  proposalFromCheckedAnswer,
  proposalWithoutModel,
  proposedFigure,
  scheduleInputKey,
  validateModelSchedule,
  type ScheduleFacts,
  type ScheduleProposal,
} from "./schedule-proposal";

// LA-1399. Matt, 2026-09-29 (LA-1394 question 1): the proposed schedule comes
// from Kulka's completed jobs, with AI comparing the new project to them. The
// jobs here are synthetic test fixtures; no real completed job is recorded yet.

const midrise: ScheduleFacts = {
  projectType: "multifamily",
  constructionKind: "new",
  grossSquareFeet: 80000,
  storiesAboveGrade: 6,
};

describe("closeEnoughJobs", () => {
  it("finds nothing in an empty table", () => {
    expect(closeEnoughJobs(midrise, [])).toEqual([]);
  });

  it("keeps a job of the same type and kind within twice or half the area and stories", () => {
    // 80,000 GSF against 60,000 is 1.33 times; 6 stories against 5 is 1.2 times.
    // The tower is 3 times the area; the storage job is another type.
    expect(closeEnoughJobs(midrise, SYNTHETIC_JOBS).map((job) => job.jobNumber)).toEqual([SYNTHETIC_MIDRISE.jobNumber]);
  });

  it("leaves out a job of the other construction kind", () => {
    expect(closeEnoughJobs({ ...midrise, constructionKind: "renovation" }, SYNTHETIC_JOBS)).toEqual([]);
  });

  it("leaves out a job past twice the stories even when the area is close", () => {
    const tall: ScheduleFacts = { ...midrise, grossSquareFeet: 200000, storiesAboveGrade: 6 };
    // 200,000 against 240,000 is close on area, but 18 stories is 3 times 6.
    expect(closeEnoughJobs(tall, [SYNTHETIC_TOWER])).toEqual([]);
    expect(closeEnoughJobs({ ...tall, storiesAboveGrade: 12 }, [SYNTHETIC_TOWER]).map((j) => j.jobNumber)).toEqual([
      SYNTHETIC_TOWER.jobNumber,
    ]);
  });

  it("compares on area alone when either side's stories are not known", () => {
    expect(closeEnoughJobs({ ...midrise, storiesAboveGrade: null }, [SYNTHETIC_MIDRISE])).toHaveLength(1);
    expect(closeEnoughJobs(midrise, [{ ...SYNTHETIC_MIDRISE, storiesAboveGrade: null }])).toHaveLength(1);
  });

  it("finds nothing for a project with no area", () => {
    expect(closeEnoughJobs({ ...midrise, grossSquareFeet: 0 }, SYNTHETIC_JOBS)).toEqual([]);
  });

  it("leaves out a job with no phase recorded, since it has no weeks to compare", () => {
    const blank = { ...SYNTHETIC_MIDRISE, phases: { precon: null, construction: null, closeout: null } };
    expect(closeEnoughJobs(midrise, [blank])).toEqual([]);
  });

  it("matches the storage job for a storage project", () => {
    const storage: ScheduleFacts = { ...midrise, projectType: "self_storage", grossSquareFeet: 50000, storiesAboveGrade: 2 };
    expect(closeEnoughJobs(storage, SYNTHETIC_JOBS).map((j) => j.jobNumber)).toEqual([SYNTHETIC_STORAGE.jobNumber]);
  });
});

/** A well-formed answer comparing the project with the synthetic mid-rise job. */
function answer(overrides: Record<string, unknown> = {}) {
  const phase = (weeks: number) => ({ weeks, leaveBlank: false, jobNumbers: ["TEST-0001"], reason: "Scaled from TEST-0001." });
  return {
    jobs: [{ jobNumber: "TEST-0001", why: "Same type and kind, a third larger." }],
    phases: { precon: phase(14), construction: phase(70), closeout: phase(8) },
    reasoning: "One close job; weeks scaled up for the larger area.",
    ...overrides,
  };
}

describe("validateModelSchedule", () => {
  const candidates = [SYNTHETIC_MIDRISE, SYNTHETIC_TOWER];

  it("accepts an answer that cites only the jobs it was handed, with positive weeks", () => {
    const checked = validateModelSchedule(answer(), candidates);
    expect(checked).toEqual({
      ok: true,
      phases: {
        precon: { weeks: 14, jobNumbers: ["TEST-0001"], reason: "Scaled from TEST-0001." },
        construction: { weeks: 70, jobNumbers: ["TEST-0001"], reason: "Scaled from TEST-0001." },
        closeout: { weeks: 8, jobNumbers: ["TEST-0001"], reason: "Scaled from TEST-0001." },
      },
      jobs: [{ jobNumber: "TEST-0001", name: SYNTHETIC_MIDRISE.name, why: "Same type and kind, a third larger." }],
      reasoning: "One close job; weeks scaled up for the larger area.",
    });
  });

  it("rounds weeks to whole weeks", () => {
    const raw = answer();
    raw.phases.construction.weeks = 69.6;
    const checked = validateModelSchedule(raw, candidates);
    expect(checked.ok && checked.phases.construction.weeks).toBe(70);
  });

  it("rejects a job that is not in the table it was handed", () => {
    const raw = answer({ jobs: [{ jobNumber: "C-99999", why: "Invented." }] });
    raw.phases.precon.jobNumbers = ["C-99999"];
    expect(validateModelSchedule(raw, candidates)).toMatchObject({ ok: false });
  });

  it("rejects a phase that cites a job missing from its compared list", () => {
    const raw = answer();
    raw.phases.construction.jobNumbers = ["TEST-0002"];
    expect(validateModelSchedule(raw, candidates)).toMatchObject({ ok: false });
  });

  it("rejects weeks that are zero, negative, or not a number", () => {
    for (const weeks of [0, -4, Number.NaN, 0.3]) {
      const raw = answer();
      raw.phases.construction.weeks = weeks;
      expect(validateModelSchedule(raw, candidates)).toMatchObject({ ok: false });
    }
    const raw = answer();
    (raw.phases.construction as Record<string, unknown>).weeks = "70";
    expect(validateModelSchedule(raw, candidates)).toMatchObject({ ok: false });
  });

  it("rejects weeks its cited jobs cannot support, past twice or half their recorded weeks", () => {
    // TEST-0001 recorded 60 construction weeks: 30 to 120 is the band.
    const high = answer();
    high.phases.construction.weeks = 121;
    expect(validateModelSchedule(high, candidates)).toMatchObject({ ok: false });
    const low = answer();
    low.phases.construction.weeks = 29;
    expect(validateModelSchedule(low, candidates)).toMatchObject({ ok: false });
    const edge = answer();
    edge.phases.construction.weeks = 120;
    expect(validateModelSchedule(edge, candidates)).toMatchObject({ ok: true });
  });

  it("rejects weeks that cite a job with no recorded weeks for that phase", () => {
    // TEST-0002 has no close-out recorded.
    const raw = answer({
      jobs: [
        { jobNumber: "TEST-0001", why: "Close." },
        { jobNumber: "TEST-0002", why: "Larger." },
      ],
    });
    raw.phases.closeout.jobNumbers = ["TEST-0002"];
    expect(validateModelSchedule(raw, candidates)).toMatchObject({ ok: false });
  });

  it("rejects a phase with weeks but no cited job", () => {
    const raw = answer();
    raw.phases.precon.jobNumbers = [];
    expect(validateModelSchedule(raw, candidates)).toMatchObject({ ok: false });
  });

  it("keeps a phase the model left blank as blank, whatever weeks it sent", () => {
    const raw = answer();
    raw.phases.closeout = { weeks: 0, leaveBlank: true, jobNumbers: [], reason: "No close-out recorded close enough." };
    const checked = validateModelSchedule(raw, candidates);
    expect(checked.ok && checked.phases.closeout).toEqual({
      weeks: null,
      jobNumbers: [],
      reason: "No close-out recorded close enough.",
    });
  });

  it("rejects a missing phase, a missing reason, and output that is not an object", () => {
    const noPhase = answer();
    delete (noPhase.phases as Partial<typeof noPhase.phases>).closeout;
    expect(validateModelSchedule(noPhase, candidates)).toMatchObject({ ok: false });
    const noReason = answer();
    noReason.phases.precon.reason = "  ";
    expect(validateModelSchedule(noReason, candidates)).toMatchObject({ ok: false });
    expect(validateModelSchedule("14 weeks", candidates)).toMatchObject({ ok: false });
    expect(validateModelSchedule(null, candidates)).toMatchObject({ ok: false });
  });

  it("rejects a job cited twice in the compared list", () => {
    const raw = answer({
      jobs: [
        { jobNumber: "TEST-0001", why: "Close." },
        { jobNumber: "TEST-0001", why: "Again." },
      ],
    });
    expect(validateModelSchedule(raw, candidates)).toMatchObject({ ok: false });
  });
});

describe("proposalWithoutModel", () => {
  it("says the table is empty and leaves every phase blank when no job is recorded", () => {
    const proposal = proposalWithoutModel(midrise, [], "2026-09-29");
    expect(proposal).toMatchObject({
      status: "no_jobs",
      phases: {
        precon: { weeks: null, jobNumbers: [] },
        construction: { weeks: null, jobNumbers: [] },
        closeout: { weeks: null, jobNumbers: [] },
      },
      jobs: [],
    });
    expect(proposal?.reasoning).toMatch(/No completed job is recorded yet/);
  });

  it("says no recorded job is close enough, and leaves every phase blank", () => {
    const proposal = proposalWithoutModel(midrise, [SYNTHETIC_TOWER, SYNTHETIC_STORAGE], "2026-09-29");
    expect(proposal?.status).toBe("none_close");
    expect(proposal?.reasoning).toMatch(/close enough/);
    expect(SCHEDULE_ALL_BLANK(proposal!)).toBe(true);
  });

  it("is null when a close job exists, since only then does the model compare", () => {
    expect(proposalWithoutModel(midrise, SYNTHETIC_JOBS, "2026-09-29")).toBeNull();
  });
});

function SCHEDULE_ALL_BLANK(proposal: ScheduleProposal) {
  return Object.values(proposal.phases).every((phase) => phase.weeks === null);
}

describe("scheduleInputKey", () => {
  it("changes when the project's facts or a compared job's weeks change, and not otherwise", () => {
    const key = scheduleInputKey(midrise, [SYNTHETIC_MIDRISE]);
    expect(scheduleInputKey({ ...midrise }, [{ ...SYNTHETIC_MIDRISE }])).toBe(key);
    expect(scheduleInputKey({ ...midrise, grossSquareFeet: 81000 }, [SYNTHETIC_MIDRISE])).not.toBe(key);
    const longer = { ...SYNTHETIC_MIDRISE, phases: { ...SYNTHETIC_MIDRISE.phases, closeout: { weeks: 9, source: "x" } } };
    expect(scheduleInputKey(midrise, [longer])).not.toBe(key);
    expect(scheduleInputKey(midrise, [])).not.toBe(key);
  });
});

function checked() {
  const result = validateModelSchedule(answer(), [SYNTHETIC_MIDRISE]);
  if (!result.ok) throw new Error(result.error);
  return proposalFromCheckedAnswer(result, { model: "claude-opus-5", proposedAt: "2026-09-29", inputKey: "k" });
}

describe("proposedFigure", () => {
  it("is the phase's weeks with origin proposed, naming the jobs behind it", () => {
    expect(proposedFigure(checked(), "construction")).toEqual({
      value: 70,
      origin: "proposed",
      ref: "schedule-proposal",
      source: "Planning assumption from completed job TEST-0001",
    });
  });

  it("is null for a phase the proposal left blank", () => {
    expect(proposedFigure(proposalWithoutModel(midrise, [], "2026-09-29")!, "precon")).toBeNull();
  });
});

describe("applyScheduleProposal", () => {
  const typed = (value: number): PlanFigure => ({ value, origin: "estimator" });
  const proposal = checked();

  it("fills every blank phase with the proposal's weeks", () => {
    expect(applyScheduleProposal({ precon: null, construction: null, closeout: null }, proposal)).toEqual({
      precon: proposedFigure(proposal, "precon"),
      construction: proposedFigure(proposal, "construction"),
      closeout: proposedFigure(proposal, "closeout"),
    });
  });

  it("keeps a phase the estimator typed, even when a new proposal arrives", () => {
    const applied = applyScheduleProposal({ precon: null, construction: typed(52), closeout: null }, proposal);
    expect(applied.construction).toEqual(typed(52));
    expect(applied.precon?.value).toBe(14);
  });

  it("replaces an older proposal's weeks, and blanks a phase the new proposal leaves blank", () => {
    const old: Record<SchedulePhase, PlanFigure | null> = {
      precon: { value: 10, origin: "proposed", ref: "schedule-proposal" },
      construction: { value: 50, origin: "proposed", ref: "schedule-proposal" },
      closeout: typed(6),
    };
    expect(applyScheduleProposal(old, proposal).construction?.value).toBe(70);
    const blank = proposalWithoutModel(midrise, [], "2026-09-29")!;
    expect(applyScheduleProposal(old, blank)).toEqual({ precon: null, construction: null, closeout: typed(6) });
  });
});
