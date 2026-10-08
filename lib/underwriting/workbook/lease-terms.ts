import type { ApartmentOperationsResult, PropertyReturnsInputs } from "@kulka/engine";

import {
  HEADER_ROWS,
  SHEET_NAMES,
  cellAddress,
  columnLetter,
  header,
  sheetRef,
  type LayoutCell,
  type LayoutContext,
  type LayoutRow,
  type LayoutSheet,
} from "./frame";
import { alloc, type OperationsBuild } from "./operations";

// LA-1950. A leasing commission is a share of the base rent a lease schedules over its whole
// term (scheduledRentOverTerm in commercial-operations.ts). The term runs past the model's
// months, so each space gets its own run of term months here, grown and allocated the way the
// Operations sheet grows and allocates commercial rent.

export type LeaseTermsBuild = {
  sheet: LayoutSheet;
  /** The commission for the space at this 1-based position in the commercial block, as a reference for the Costs sheet. */
  commission: (spaceIndex: number) => string;
};

const FIRST_TERM_COLUMN = 2;

export function buildLeaseTermsSheet(ctx: LayoutContext, operations: ApartmentOperationsResult, ops: OperationsBuild): LeaseTermsBuild | null {
  const inputs = ctx.source.inputs as PropertyReturnsInputs;
  const spaces = inputs.commercial?.spaces ?? [];
  const summaries = operations.commercial?.spaces;
  if (spaces.length === 0 || !summaries) return null;

  const rows: LayoutRow[] = header(ctx.source, "Lease Terms");
  const commissionRows = new Map<number, number>();
  const note = "Each run follows one lease from its start month through its term. The term's length is fixed at the length when the workbook was made.";
  rows.push({ cells: [{ kind: "text", text: note, role: "note" }] });

  spaces.forEach((space, index) => {
    const s = index + 1;
    const term = space.leaseTermMonths;
    const firstLetter = columnLetter(FIRST_TERM_COLUMN);
    const lastLetter = columnLetter(FIRST_TERM_COLUMN + term - 1);
    const at = (rowIndex: number, k: number) => cellAddress(rowIndex, FIRST_TERM_COLUMN + k);
    rows.push({ cells: [] });
    rows.push({ cells: [{ kind: "text", text: space.name, role: "section" }] });
    const countRow = rows.length;
    const offsetRow = countRow + 1;
    const periodsRow = countRow + 2;
    const factorRow = countRow + 3;
    const rentRow = countRow + 4;
    const sumRow = countRow + 5;
    const commissionRow = countRow + 6;
    const line = (label: string, build: (k: number) => string, format: "number" = "number"): LayoutRow => ({
      outlineLevel: 1,
      cells: [
        { kind: "text", text: label, role: "label" },
        null,
        ...Array.from({ length: term }, (_, k): LayoutCell => ({ kind: "calc", format, formula: build(k) })),
      ],
    });
    rows.push(line("Month Count", (k) => (k === 0 ? ops.scalar(`s.leaseStart.${s}`) : `${at(countRow, k - 1)}+1`)));
    rows.push(line("Months From Operation Start", (k) => `${at(countRow, k)}-${ops.scalar("s.opStart")}`));
    rows.push(line("Growth Years Elapsed", (k) => `IF(${at(countRow, k)}<${ops.scalar("s.growthStart")},0,INT((${at(countRow, k)}-${ops.scalar("s.growthStart")})/12))`));
    rows.push(line("Commercial Rent Growth Factor", (k) => ops.commercialGrowth(at(periodsRow, k))));
    rows.push(line("Scheduled Base Rent (Cents)", (k) => alloc(`ROUND(${ops.scalar(`s.annualRent.${s}`)}*${at(factorRow, k)},0)`, `MOD(${at(offsetRow, k)},12)`)));
    rows.push({
      cells: [
        { kind: "text", text: "Base Rent Over the Term (Cents)", role: "label" },
        { kind: "calc", format: "number", formula: `SUM(${firstLetter}${rentRow + 1}:${lastLetter}${rentRow + 1})` },
      ],
    });
    rows.push({
      cells: [
        { kind: "text", text: "Leasing Commission", role: "label" },
        {
          kind: "output",
          id: `lease.${s}.commission`,
          format: "money",
          engineValue: summaries[index].leasingCommission,
          formula: `ROUND(B${sumRow + 1}*${ctx.input(`commercial.spaces.${s}.leasingCommissionPercent`)}/100,0)/100`,
        },
      ],
    });
    commissionRows.set(s, commissionRow + 1);
  });

  return {
    sheet: {
      name: SHEET_NAMES.leaseTerms,
      columnWidths: [44, 18, ...Array.from({ length: Math.max(...spaces.map(({ leaseTermMonths }) => leaseTermMonths)) }, () => 12)],
      frozen: { rows: HEADER_ROWS, columns: 1 },
      rows,
    },
    commission: (spaceIndex) => sheetRef(SHEET_NAMES.leaseTerms, `B${commissionRows.get(spaceIndex)}`),
  };
}
