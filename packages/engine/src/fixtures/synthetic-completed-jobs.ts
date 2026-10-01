import type { CompletedJob } from "../schedule-proposal";

// SYNTHETIC. None of these jobs exists. They stand in for Kulka's completed
// jobs so the schedule proposal (LA-1399) can be tested before Matt records a
// real one. Production ships the completed_jobs table empty; nothing here is
// ever seeded into it. Every job number starts with "TEST-" so a synthetic job
// can never be mistaken for a real Kulka job number (such as C-00456).

export const SYNTHETIC_MIDRISE: CompletedJob = {
  jobNumber: "TEST-0001",
  name: "Synthetic Test Job, Mid-Rise Multifamily",
  buildingType: "multifamily",
  constructionKind: "new",
  grossSquareFeet: 60000,
  storiesAboveGrade: 5,
  phases: {
    precon: { weeks: 12, source: "Synthetic test fixture, not a real job" },
    construction: { weeks: 60, source: "Synthetic test fixture, not a real job" },
    closeout: { weeks: 8, source: "Synthetic test fixture, not a real job" },
  },
};

export const SYNTHETIC_TOWER: CompletedJob = {
  jobNumber: "TEST-0002",
  name: "Synthetic Test Job, High-Rise Multifamily",
  buildingType: "multifamily",
  constructionKind: "new",
  grossSquareFeet: 240000,
  storiesAboveGrade: 18,
  phases: {
    precon: { weeks: 26, source: "Synthetic test fixture, not a real job" },
    construction: { weeks: 110, source: "Synthetic test fixture, not a real job" },
    closeout: null,
  },
};

export const SYNTHETIC_STORAGE: CompletedJob = {
  jobNumber: "TEST-0003",
  name: "Synthetic Test Job, Self Storage",
  buildingType: "self_storage",
  constructionKind: "new",
  grossSquareFeet: 70000,
  storiesAboveGrade: 3,
  phases: {
    precon: { weeks: 6, source: "Synthetic test fixture, not a real job" },
    construction: { weeks: 40, source: "Synthetic test fixture, not a real job" },
    closeout: { weeks: 4, source: "Synthetic test fixture, not a real job" },
  },
};

export const SYNTHETIC_JOBS: readonly CompletedJob[] = [SYNTHETIC_MIDRISE, SYNTHETIC_TOWER, SYNTHETIC_STORAGE];
