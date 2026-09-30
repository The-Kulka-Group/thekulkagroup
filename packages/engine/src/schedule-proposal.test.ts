import { describe, expect, it } from "vitest";

import {
  SYNTHETIC_JOBS,
  SYNTHETIC_MIDRISE,
  SYNTHETIC_STORAGE,
  SYNTHETIC_TOWER,
} from "./fixtures/synthetic-completed-jobs";
import { closeEnoughJobs, validateModelSchedule, type ScheduleFacts } from "./schedule-proposal";

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
