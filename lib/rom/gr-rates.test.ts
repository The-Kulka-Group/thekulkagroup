import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { QUANTITY_RULES } from "@kulka/engine";

import { seededDatabase } from "@/test/database";

import { readGrRates, type GrRate } from "./gr-rates";

// LA-1396. The General Requirements tab of estimate C-00379 loads as a rate
// card beside the staffing and field-office rates.

let db: Awaited<ReturnType<typeof seededDatabase>>;
let rates: GrRate[];

beforeAll(async () => {
  db = await seededDatabase();
  rates = await readGrRates(db);
});
afterAll(async () => {
  await db.close();
});

const find = (item: string) => {
  const hit = rates.find((r) => r.item === item);
  if (!hit) throw new Error(`No rate card row named ${item}`);
  return hit;
};

describe("General Requirements rate card", () => {
  it("loads every line on the tab, including lines with no rate", () => {
    expect(rates).toHaveLength(168);
    expect(rates.filter((r) => r.rate === null).length).toBeGreaterThan(0);
    expect(new Set(rates.map((r) => r.section))).toEqual(
      new Set([
        "Construction Labor & Clean-up",
        "Site Controls",
        "Temporary & OSHA Protection",
        "Security",
        "Hoists, Cranes & Scaffolding",
        "Surveying, Site Safety & Consultants",
        "Permits, Fees & Expediting",
        "Cold Weather Protection",
        "Temporary Utilities",
        "Insurances & Bonds",
      ]),
    );
  });

  it("carries the known rates with their units and basis", () => {
    expect(find("Final Cleaning")).toMatchObject({ rate: 0.55, unit: "SF", basis: "unit" });
    expect(find("OSHA Protection")).toMatchObject({ rate: 0.45, unit: "GSF", basis: "unit" });
    expect(find("Survey Crew")).toMatchObject({ rate: 2500, unit: "Days", basis: "unit" });
    expect(find("Laborers")).toMatchObject({ rate: 1400, basis: "phase_weeks", phase: "construction" });
    expect(find("Sanitary Facilities, Port-a-John")).toMatchObject({
      rate: 90,
      basis: "phase_months",
      phase: "construction",
    });
    expect(find("Walk-Off Mats")).toMatchObject({ rate: 1500, basis: "lump_sum" });
  });

  it("names the source estimate and flags every row as one warehouse job", () => {
    for (const r of rates) {
      expect(r.sourceEstimate).toBe("C-00379");
      expect(r.singleJobWarehouse).toBe(true);
      expect(r.sourceJob).toContain("120,000 SF warehouse");
    }
  });

  it("loads Insurances & Bonds as not priceable and nothing else", () => {
    const insurance = rates.filter((r) => r.section === "Insurances & Bonds");
    expect(insurance).toHaveLength(8);
    expect(insurance.every((r) => !r.priceable && r.notPriceableReason)).toBe(true);
    expect(rates.filter((r) => r.section !== "Insurances & Bonds").every((r) => r.priceable)).toBe(true);
  });

  it("refuses a priceable Insurances & Bonds row", async () => {
    await expect(
      db.query(`update gr_rates set priceable = true, not_priceable_reason = null where item = 'Builders Risk'`),
    ).rejects.toThrow();
  });

  it("leaves the staffing and field-office rows as they were", async () => {
    const staffing = await db.query<{ n: string }>(`select count(*) n from gc_staffing_rates`);
    const office = await db.query<{ n: string }>(`select count(*) n from gc_field_office_rates`);
    expect(Number(staffing.rows[0].n)).toBe(26);
    expect(Number(office.rows[0].n)).toBe(33);
  });
});

describe("quantity rules name real rate card rows (LA-1401)", () => {
  it("finds every row a quantity rule fills on the card, priceable", () => {
    for (const rule of QUANTITY_RULES) {
      for (const row of rule.rows) {
        const hit = rates.find((r) => r.section === row.section && r.item === row.item);
        expect(hit, `${rule.id}: ${row.section} / ${row.item}`).toBeDefined();
        expect(hit?.priceable).toBe(true);
      }
    }
  });
});
