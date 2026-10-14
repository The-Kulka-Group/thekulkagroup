import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { NewBudget } from "@/lib/rom/projects";
import { insertRomProject, updateRomProject } from "@/lib/rom/projects";
import { seededDatabase } from "@/test/database";

import { createUnderwritingCase, getUnderwritingCase, saveUnderwritingCostSchedule, updateUnderwritingCase, type CaseDraft } from "./cases";
import { seedFromIntake } from "./intake-seed";
import { applyLatestRomRun, linkRomProject, linkRomProjectWithin, listRomBudgetOptions, readCaseForRomProject, readRomLink, RomLinkError } from "./rom-link";

let db: Awaited<ReturnType<typeof seededDatabase>>;

const draft: CaseDraft = {
  name: "Harbor Lofts",
  address: "1 Harbor Way",
  proposedUnits: 60,
  grossBuildingSquareFeet: 50000,
  assumptions: { hardCostPerGrossSquareFoot: 300, softCostPercent: 20, constructionMonths: 18 },
};

const budget: NewBudget = {
  name: "Old Budget Name",
  grossSquareFeet: 50000,
  projectType: "multifamily",
  constructionKind: "new",
  framingSystem: null,
};

async function recordRun(projectId: string, low: number, high: number, startedAt: string, grossSquareFeet: number | null = 50000) {
  const rom = { lines: [], total: { low, high }, kulkaContractTotal: { low, high }, carvedOut: { low: 0, high: 0 } };
  const { rows } = await db.query<{ id: string }>(
    `insert into runs (project_id, skill, status, rom, answers, started_at)
     values ($1, 'rom_tier1', 'succeeded', $2::jsonb, $3::jsonb, $4) returning id`,
    [projectId, JSON.stringify(rom), JSON.stringify(grossSquareFeet ? { grossSquareFeet } : {}), startedAt],
  );
  return rows[0].id;
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("ROM budget link (LA-2417)", () => {
  it("names the budget after the case and keeps both names together", async () => {
    const created = (await createUnderwritingCase(db, draft))!;
    const projectId = await insertRomProject(db, budget);
    await linkRomProject(db, created.id, projectId);

    expect((await readRomLink(db, created.id))?.projectName).toBe("Harbor Lofts");
    expect(await readCaseForRomProject(db, projectId)).toEqual({ id: created.id, name: "Harbor Lofts" });

    const linked = (await getUnderwritingCase(db, created.id))!;
    await updateUnderwritingCase(db, created.id, { ...draft, name: "Harbor Lofts II" }, linked.caseRevision);
    expect((await readRomLink(db, created.id))?.projectName).toBe("Harbor Lofts II");

    await updateRomProject(db, projectId, { ...budget, name: "Harbor Lofts III" });
    const renamed = (await getUnderwritingCase(db, created.id))!;
    expect(renamed.name).toBe("Harbor Lofts III");
    expect(renamed.caseRevision).toBeGreaterThan(linked.caseRevision + 1);
  });

  it("refuses a budget another case already linked, and leaves it out of the list", async () => {
    const first = (await createUnderwritingCase(db, draft))!;
    const second = (await createUnderwritingCase(db, { ...draft, name: "Other" }))!;
    const projectId = await insertRomProject(db, budget);
    await recordRun(projectId, 14_000_000, 16_000_000, "2026-10-01T12:00:00Z");
    await linkRomProject(db, first.id, projectId);

    await expect(linkRomProject(db, second.id, projectId)).rejects.toBeInstanceOf(RomLinkError);
    expect(await listRomBudgetOptions(db, second.id)).toEqual([]);
    expect((await listRomBudgetOptions(db, first.id)).map((option) => option.id)).toEqual([projectId]);
  });

  it("reports nothing to fill while the budget has no saved run", async () => {
    const created = (await createUnderwritingCase(db, draft))!;
    await linkRomProject(db, created.id, await insertRomProject(db, budget));
    expect(await applyLatestRomRun(db, created.id)).toBe(false);
    expect((await readRomLink(db, created.id))?.latest).toBeNull();
  });

  it("fills the intake hard cost before the schedule is saved", async () => {
    const created = (await createUnderwritingCase(db, draft))!;
    const projectId = await insertRomProject(db, budget);
    const runId = await recordRun(projectId, 14_000_000, 16_000_000, "2026-10-01T12:00:00Z");
    await linkRomProject(db, created.id, projectId);

    expect(await applyLatestRomRun(db, created.id)).toBe(true);
    const filled = (await getUnderwritingCase(db, created.id))!;
    const hardCost = filled.assumptions.find((assumption) => assumption.name === "hardCostPerGrossSquareFoot");
    expect(hardCost).toMatchObject({ value: 300, sourceLabel: "ROM: Harbor Lofts, Oct 1, 2026", reviewState: "working" });
    expect(seedFromIntake(filled).costLines.find((line) => line.id === "intake-hard-cost")?.basis).toEqual({ type: "per_gross_square_foot", rate: 300 });
    expect(await readRomLink(db, created.id)).toMatchObject({ appliedRunId: runId, applied: { total: 15_000_000, perGrossSquareFoot: 300 } });
  });

  it("dates the fill by the New York day the run was saved, and rounds the rate to the cent", async () => {
    const created = (await createUnderwritingCase(db, draft))!;
    const projectId = await insertRomProject(db, budget);
    await recordRun(projectId, 14_000_000, 16_000_001, "2026-10-14T02:00:00Z");
    await linkRomProject(db, created.id, projectId);
    await applyLatestRomRun(db, created.id);

    const hardCost = (await getUnderwritingCase(db, created.id))!.assumptions.find((assumption) => assumption.name === "hardCostPerGrossSquareFoot");
    expect(hardCost).toMatchObject({ value: 300, sourceLabel: "ROM: Harbor Lofts, Oct 13, 2026", sourceDate: "2026-10-13" });
  });

  it("rewrites the saved hard cost line and shows a newer run without applying it", async () => {
    const created = (await createUnderwritingCase(db, draft))!;
    const seed = seedFromIntake(created, "2027-01");
    const saved = (await saveUnderwritingCostSchedule(db, created.id, created.caseRevision, {
      analysisStartMonth: "2027-01",
      saleMonth: "2030-01",
      costLines: seed.costLines,
    }))!;
    const projectId = await insertRomProject(db, budget);
    const firstRun = await recordRun(projectId, 17_000_000, 19_000_000, "2026-10-01T12:00:00Z");
    await linkRomProject(db, saved.id, projectId);
    await applyLatestRomRun(db, saved.id);

    const filled = (await getUnderwritingCase(db, saved.id))!;
    const line = filled.costSchedule!.costLines.find((item) => item.id === "intake-hard-cost");
    expect(line).toMatchObject({ basis: { type: "per_gross_square_foot", rate: 360 }, sourceLabel: "ROM: Harbor Lofts, Oct 1, 2026", reviewState: "working" });
    expect(filled.costSchedule!.costLines.find((item) => item.id === "intake-soft-cost")?.basis).toMatchObject({ baseLineId: "intake-hard-cost" });

    const newerRun = await recordRun(projectId, 19_000_000, 21_000_000, "2026-10-05T12:00:00Z");
    const link = (await readRomLink(db, saved.id))!;
    expect(link.appliedRunId).toBe(firstRun);
    expect(link.latest?.runId).toBe(newerRun);
    expect((await getUnderwritingCase(db, saved.id))!.costSchedule!.costLines.find((item) => item.id === "intake-hard-cost")?.basis).toMatchObject({ rate: 360 });
  });

  it("adds a hard cost line when the saved schedule has none", async () => {
    const created = (await createUnderwritingCase(db, draft))!;
    await saveUnderwritingCostSchedule(db, created.id, created.caseRevision, {
      analysisStartMonth: "2027-01",
      saleMonth: "2030-01",
      costLines: [],
    });
    const projectId = await insertRomProject(db, budget);
    await recordRun(projectId, 14_000_000, 16_000_000, "2026-10-01T12:00:00Z");
    await linkRomProject(db, created.id, projectId);
    await applyLatestRomRun(db, created.id);

    const line = (await getUnderwritingCase(db, created.id))!.costSchedule!.costLines.find((item) => item.id === "rom-hard-cost");
    expect(line).toMatchObject({ name: "Hard Cost", category: "hard_cost", basis: { type: "per_gross_square_foot", rate: 300 }, startMonth: "2027-01" });
  });

  it("leaves an edited line alone when the budget has no newer run", async () => {
    const created = (await createUnderwritingCase(db, draft))!;
    const seed = seedFromIntake(created, "2027-01");
    await saveUnderwritingCostSchedule(db, created.id, created.caseRevision, { analysisStartMonth: "2027-01", saleMonth: "2030-01", costLines: seed.costLines });
    const projectId = await insertRomProject(db, budget);
    await recordRun(projectId, 17_000_000, 19_000_000, "2026-10-01T12:00:00Z");
    await linkRomProject(db, created.id, projectId);
    await applyLatestRomRun(db, created.id);

    const filled = (await getUnderwritingCase(db, created.id))!;
    const edited = filled.costSchedule!.costLines.map((line) => line.id === "intake-hard-cost"
      ? { ...line, basis: { type: "per_gross_square_foot" as const, rate: 340 }, sourceLabel: "Analyst", reviewState: "done" as const }
      : line);
    await saveUnderwritingCostSchedule(db, created.id, filled.caseRevision, { ...filled.costSchedule!, costLines: edited });

    expect(await applyLatestRomRun(db, created.id)).toBe(true);
    const line = (await getUnderwritingCase(db, created.id))!.costSchedule!.costLines.find((item) => item.id === "intake-hard-cost");
    expect(line).toMatchObject({ basis: { rate: 340 }, sourceLabel: "Analyst" });
  });

  it("spreads a run with no recorded area over the case's own area", async () => {
    const created = (await createUnderwritingCase(db, draft))!;
    const projectId = await insertRomProject(db, budget);
    await recordRun(projectId, 9_000_000, 11_000_000, "2026-10-01T12:00:00Z", null);
    await linkRomProject(db, created.id, projectId);

    expect(await applyLatestRomRun(db, created.id)).toBe(true);
    const hardCost = (await getUnderwritingCase(db, created.id))!.assumptions.find((assumption) => assumption.name === "hardCostPerGrossSquareFoot");
    expect(hardCost?.value).toBe(200);
  });

  it("refuses to mark a case filled when neither the run nor the case has an area", async () => {
    const created = (await createUnderwritingCase(db, { ...draft, grossBuildingSquareFeet: undefined }))!;
    const projectId = await insertRomProject(db, budget);
    await recordRun(projectId, 9_000_000, 11_000_000, "2026-10-01T12:00:00Z", null);
    await linkRomProject(db, created.id, projectId);

    await expect(applyLatestRomRun(db, created.id)).rejects.toBeInstanceOf(RomLinkError);
    expect((await readRomLink(db, created.id))?.appliedRunId).toBeNull();
  });

  it("gives the case the budget's name when the budget was just made from it", async () => {
    const created = (await createUnderwritingCase(db, draft))!;
    const projectId = await db.withTransaction(async (tx) => {
      const id = await insertRomProject(tx, { ...budget, name: "Harbor Lofts Phase 1" });
      await linkRomProjectWithin(tx, created.id, id, "budget");
      return id;
    });
    expect((await getUnderwritingCase(db, created.id))!.name).toBe("Harbor Lofts Phase 1");
    expect((await readRomLink(db, created.id))?.projectName).toBe("Harbor Lofts Phase 1");
    expect(await readCaseForRomProject(db, projectId)).toMatchObject({ name: "Harbor Lofts Phase 1" });
  });
});
