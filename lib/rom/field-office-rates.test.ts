import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seededDatabase } from "@/test/database";

import { readFieldOfficeRates } from "./markup";
import type { FieldOfficeRate } from "@kulka/engine";

// LA-1403. Every field-office row is checked against the row of the C-00379
// General Conditions tab it cites (117 N Long Beach Rd GC's REV1.xlsx). The
// LA-1397 golden fixture cites the same rows.

let db: Awaited<ReturnType<typeof seededDatabase>>;
let rates: FieldOfficeRate[];

beforeAll(async () => {
  db = await seededDatabase();
  rates = await readFieldOfficeRates(db);
});
afterAll(async () => {
  await db.close();
});

const find = (item: string) => {
  const hit = rates.find((r) => r.item === item);
  if (!hit) throw new Error(`No field-office row named ${item}`);
  return hit;
};

/** [sheet rows, item, basis, rate, recurring rate] */
const SHEET: [string, string, FieldOfficeRate["rateBasis"], number, number | null][] = [
  ["70", "Single wide (12' x 60') trailer rental", "monthly", 800, null],
  ["74", "Double wide (12' x 60') trailer rental", "monthly", 3200, null],
  ["78", "Triple wide (12' x 60') trailer rental", "monthly", 3317, null],
  ["82", "Teamster office/shanty rental", "monthly", 530, null],
  ["91", "Relocate single wide", "lump_sum", 5525, null],
  ["92", "Relocate double wide", "lump_sum", 15140, null],
  ["93", "Relocate triple wide", "lump_sum", 24120, null],
  ["94 to 100", "Electric Connect", "lump_sum", 0, null],
  ["102 to 107", "Plumbing Connect", "lump_sum", 0, null],
  ["109 to 114", "Office Supplies", "lump_sum", 500, null],
  ["116 to 121", "Field equipment (desks, file cabinets)", "lump_sum", 2000, null],
  ["123 to 143", "Computers", "lump_sum", 2750, null],
  ["145 to 150", "Field Office Fit-Out (Kitchens, Plan Tables, Racks, Conference Table)", "lump_sum", 2500, null],
  ["152 to 157", "Tel/Data Service", "lump_sum", 500, null],
  ["159 to 164", "Networking/Printer Setup", "lump_sum", 3200, null],
  ["166 to 171", "ISP Service", "monthly", 175, null],
  ["173 to 178", "Tel/Data Bill", "monthly", 100, null],
  ["180", "Field equipment", "monthly", 250, null],
  ["181", "Coffee/supplies/food", "monthly", 250, null],
  ["183 to 188", "Trailer alarm, central station monitoring", "monthly", 150, null],
  ["189", "Storage containers", "monthly", 150, null],
  ["190", "ID cards", "lump_sum", 1500, null],
  ["192", "Medical kit, per field office", "each", 500, null],
  ["198", "Progress photographs", "monthly", 600, null],
  ["201", "Kulka signage", "lump_sum", 2000, null],
  ["202", "Project ID sign", "lump_sum", 2500, null],
  ["203", "Safety signs", "lump_sum", 2000, null],
  ["204", "Drinking water", "monthly", 120, null],
  ["206", "Gators (on-site vehicles)", "each", 10000, null],
  ["212", "Blueprinting", "lump_sum", 3000, null],
  ["213", "Fed Ex/UPS", "monthly", 100, null],
  ["214", "Messenger service", "monthly", 100, null],
  ["215", "Travel, meals, and misc.", "monthly", 100, null],
];

describe("field-office rate card against the C-00379 sheet", () => {
  it.each(SHEET)("sheet row %s: %s", (_rows, item, basis, rate, recurring) => {
    const row = find(item);
    expect(row.rateBasis).toBe(basis);
    expect(row.rate).toBe(rate);
    expect(row.recurringRate).toBe(recurring);
  });

  it("holds exactly the rows the sheet supports", () => {
    expect(rates).toHaveLength(SHEET.length);
  });

  it("no longer carries the mislabeled rows", () => {
    const items = rates.map((r) => r.item);
    for (const gone of ["Electric connect", "Phone/data connect", "Plumbing connect", "Office fit-out/furniture allowance"]) {
      expect(items).not.toContain(gone);
    }
  });
});
