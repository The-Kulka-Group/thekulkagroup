import {
  computeApartmentOperations,
  leasingCommissionLineId,
  tenantImprovementLineId,
  type CostCategory,
  type CostDistributionMethod,
  type CostLineSchedule,
  type MonthlyCostLine,
  type MonthlyCostScheduleResult,
  type PercentOfTotalBase,
  type PropertyReturnsInputs,
} from "@kulka/engine";

import {
  HEADER_ROWS,
  SHEET_NAMES,
  absoluteAddress,
  cellAddress,
  columnLetter,
  dateOfMonthText,
  header,
  monthCount,
  sheetRef,
  type LayoutCell,
  type LayoutContext,
  type LayoutRow,
  type LayoutSheet,
} from "./frame";

// LA-1949. The monthly cost schedule as live formulas, following monthly-cost-schedule.ts
// line for line: each line's amount from its basis, its first and last month from typed
// months or milestone anchors, and its monthly spread from the cumulative curve with the
// last month taking whatever is left. Percent-of-total lines settle on the Percent
// Settling sheet by the same rounds the engine runs.

const CATEGORIES: CostCategory[] = ["land", "hard_cost", "soft_cost", "development_fee", "financing_fee"];

const CATEGORY_LABELS: Record<CostCategory, string> = {
  land: "Land",
  hard_cost: "Hard Cost",
  soft_cost: "Soft Cost",
  development_fee: "Development Fee",
  financing_fee: "Financing Fee",
};

const CURVE_LABELS: Record<CostDistributionMethod, string> = {
  straight_line: "Straight Line",
  s_curve: "S Curve",
  front_loaded: "Front Loaded",
  back_loaded: "Back Loaded",
};

/** The order MATCH reads. Excel matches text without regard to case. */
const CURVE_LIST = `{"Straight Line","S Curve","Front Loaded","Back Loaded"}`;

const BASIS_LABELS = {
  fixed: "Entered Amount",
  per_gross_square_foot: "Per Gross Square Foot",
  per_unit: "Per Unit",
  percent_of_line: "Percent of Line",
  percent_of_total: "Percent of Total",
  derived: "Derived From Commercial Space",
} as const;

/** An input that holds a token such as `hard_cost`, shown as text such as `Hard Cost`. */
function labelOf(inputName: string) {
  return `SUBSTITUTE(PROPER(${inputName}),"_"," ")`;
}

const COLUMN = { name: 0, category: 1, basis: 2, rate: 3, amount: 4, first: 5, last: 6, months: 7, curve: 8, total: 9, firstMonth: 10 } as const;

/** The row holding the month column headings; the month count each formula reads sits in the row above. */
const HEADING_ROW = HEADER_ROWS;
const COUNT_ROW = HEADER_ROWS - 1;
const FIRST_LINE_ROW = HEADER_ROWS + 2;

type Line = {
  position: number;
  schedule: CostLineSchedule;
  /** The 1-based position in the entered cost lines, which is the path the Assumptions sheet uses. Null for a derived line. */
  enteredIndex: number | null;
  entered: MonthlyCostLine | null;
  derived: { spaceIndex: number; kind: "tenant_improvement" | "leasing_commission" } | null;
  potBase: PercentOfTotalBase | null;
  basePosition: number | null;
  dependent: boolean;
};

export type CostsBuild = {
  costs: LayoutSheet;
  settling: LayoutSheet | null;
  /** Where the other sheets read the cost schedule. */
  refs: {
    /** The month's total uses on the Costs sheet, by month position. */
    monthTotal: (monthPosition: number) => string;
    total: string;
    land: string;
    /** The funding plan's financing, once the Monthly sheet exists to read it from. No-op for a case without a financed percent line. */
    linkFinancing: (formula: string) => void;
  };
  schedule: MonthlyCostScheduleResult;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function costScheduleFor(ctx: LayoutContext): MonthlyCostScheduleResult {
  const { source } = ctx;
  const inputs = source.inputs as PropertyReturnsInputs;
  const { totals } = source.result.developmentCapital;
  // The financing a percent-of-total line counts is what the funded plan added to project cost.
  const run = computeApartmentOperations(inputs, { financingCost: round2(totals.totalUses - totals.projectCosts) });
  if (run.status !== "complete" || !run.result) {
    throw new Error("The workbook needs the cost schedule, and the saved inputs no longer calculate.");
  }
  return run.result.costSchedule;
}

function linesFor(ctx: LayoutContext, schedule: MonthlyCostScheduleResult): Line[] {
  const inputs = ctx.source.inputs as PropertyReturnsInputs;
  const entered = inputs.costLines;
  const spaces = inputs.commercial?.spaces ?? [];
  const derivedIds = new Map<string, Line["derived"]>();
  spaces.forEach((space, spaceIndex) => {
    derivedIds.set(tenantImprovementLineId(space.id), { spaceIndex: spaceIndex + 1, kind: "tenant_improvement" });
    derivedIds.set(leasingCommissionLineId(space.id), { spaceIndex: spaceIndex + 1, kind: "leasing_commission" });
  });
  const lines: Line[] = schedule.costLineSchedules.map((entry, position) => {
    const enteredLine = position < entered.length ? entered[position] : null;
    const derived = enteredLine ? null : derivedIds.get(entry.lineId) ?? null;
    if (!enteredLine && !derived) throw new Error(`The workbook cannot place the derived cost line ${entry.lineId}.`);
    const basis = enteredLine?.basis;
    return {
      position,
      schedule: entry,
      enteredIndex: enteredLine ? position + 1 : null,
      entered: enteredLine,
      derived,
      potBase: basis?.type === "percent_of_total" ? basis.base : null,
      basePosition: basis?.type === "percent_of_line"
        ? schedule.costLineSchedules.findIndex(({ lineId }) => lineId === basis.baseLineId)
        : null,
      dependent: false,
    };
  });
  const dependsOnTotal = (line: Line, seen = new Set<number>()): boolean => {
    if (line.potBase) return true;
    if (line.basePosition === null || seen.has(line.position)) return false;
    seen.add(line.position);
    return dependsOnTotal(lines[line.basePosition], seen);
  };
  for (const line of lines) line.dependent = line.potBase === null && dependsOnTotal(line);
  return lines;
}

/** The first or last month of a line or lease as an Excel date: a typed month, or a milestone month moved by its offset. */
function anchoredDate(ctx: LayoutContext, anchor: { milestoneId: string; offsetMonths: number } | undefined, anchorPath: string, typedPath: string) {
  if (!anchor) return dateOfMonthText(ctx.input(typedPath));
  const milestones = (ctx.source.inputs as PropertyReturnsInputs).milestones ?? [];
  const found = milestones.findIndex(({ id }) => id === anchor.milestoneId);
  if (found < 0) throw new Error(`The anchor at ${anchorPath} points at a milestone the case does not hold.`);
  return `EDATE(${dateOfMonthText(ctx.input(`milestones.${found + 1}.month`))},${ctx.input(`${anchorPath}.offsetMonths`)})`;
}

function cumulative(step: string, row: number) {
  const months = `$${columnLetter(COLUMN.months)}${row}`;
  const amount = `$${columnLetter(COLUMN.amount)}${row}`;
  const curve = `$${columnLetter(COLUMN.curve)}${row}`;
  const share = `${step}/${months}`;
  return `IF(${step}>=${months},${amount},ROUND(${amount}*CHOOSE(MATCH(${curve},${CURVE_LIST},0),${share},3*(${share})^2-2*(${share})^3,1-(1-${share})^2,(${share})^2),2))`;
}

/** How many rounds the percent-of-total solve needs before every share moves by no more than a cent. */
function settlingRounds(lines: Line[], amounts: number[], financing: number, percentOf: (line: Line) => number): number {
  const pots = lines.filter(({ potBase }) => potBase);
  if (pots.length === 0) return 0;
  const resolve = (shares: Map<number, number>) => {
    const out: number[] = [];
    const get = (position: number): number => {
      if (out[position] !== undefined) return out[position];
      const line = lines[position];
      const value = line.potBase
        ? shares.get(position)!
        : line.dependent
          ? round2(get(line.basePosition!) * percentOf(line) / 100)
          : amounts[position];
      out[position] = value;
      return value;
    };
    lines.forEach((_, position) => get(position));
    return out;
  };
  let shares = new Map(pots.map(({ position }) => [position, 0]));
  for (let round = 1; round <= 200; round += 1) {
    const current = resolve(shares);
    const next = new Map<number, number>();
    let largestMove = 0;
    for (const pot of pots) {
      const base = lines.reduce((sum, other) => {
        if (other.position === pot.position) return sum;
        const included = pot.potBase === "total_cost"
          || (pot.potBase === "total_less_land" && other.schedule.category !== "land")
          || (pot.potBase === "hard_and_soft" && (other.schedule.category === "hard_cost" || other.schedule.category === "soft_cost"));
        return included ? sum + current[other.position] : sum;
      }, pot.potBase === "hard_and_soft" ? 0 : financing);
      const share = round2(base * percentOf(pot) / 100);
      next.set(pot.position, share);
      largestMove = Math.max(largestMove, Math.abs(share - shares.get(pot.position)!));
    }
    shares = next;
    if (largestMove <= 0.011) return round + 1;
  }
  throw new Error("The percent-of-total lines do not settle, so the workbook cannot show them.");
}

export function buildCostsSheets(ctx: LayoutContext, schedule: MonthlyCostScheduleResult): CostsBuild {
  const { source } = ctx;
  const inputs = source.inputs as PropertyReturnsInputs;
  const lines = linesFor(ctx, schedule);
  const monthKeys = schedule.months.map(({ month }) => month);
  const count = lines.length;
  const lastLineRow = FIRST_LINE_ROW + count - 1;
  const totalsSectionRow = lastLineRow + 2;
  const totalRow = totalsSectionRow + 1;
  const categorySectionRow = totalRow + 2;
  const categoryRow = (category: CostCategory) => categorySectionRow + 1 + CATEGORIES.indexOf(category);
  const potLines = lines.filter(({ potBase }) => potBase);
  const financed = potLines.some(({ potBase }) => potBase !== "hard_and_soft");
  const financingSectionRow = categorySectionRow + CATEGORIES.length + 2;
  const financingRow = financingSectionRow + 1;
  const { totals } = source.result.developmentCapital;
  const financing = round2(totals.totalUses - totals.projectCosts);

  const percentName = (line: Line) => ctx.input(`costLines.${line.enteredIndex}.basis.percent`);
  const percentValue = (line: Line) => (line.entered!.basis as { percent: number }).percent;
  const rounds = settlingRounds(lines, lines.map(({ schedule: entry }) => entry.amount), financing, percentValue);
  const settleColumn = (round: number) => 1 + round;
  const settleSheet = SHEET_NAMES.settling;

  const rowNumber = (rowIndex: number) => rowIndex + 1;

  // ----------------------------------------------------------------- a cost line
  const lineRows = lines.map((line): LayoutRow => {
    const rowIndex = FIRST_LINE_ROW + line.position;
    const row = rowNumber(rowIndex);
    const id = `costs.${line.schedule.lineId}`;
    const k = line.enteredIndex;
    const p = (path: string) => ctx.input(`costLines.${k}.${path}`);
    const entered = line.entered;
    const basis = entered?.basis;
    const basisType = basis?.type ?? "fixed";

    let category: LayoutCell;
    let basisLabel: string;
    let rate: LayoutCell | null = null;
    let amount: LayoutCell;
    let firstMonth: LayoutCell;
    let lastMonth: LayoutCell;
    let curve: LayoutCell;

    if (entered) {
      category = { kind: "calc", formula: labelOf(p("category")), format: "text" };
      basisLabel = BASIS_LABELS[basisType];
      curve = { kind: "calc", formula: labelOf(p("distributionMethod")), format: "text" };
      let formula: string;
      if (basisType === "fixed") formula = `ROUND(${p("amount")},2)`;
      else if (basis?.type === "per_gross_square_foot") {
        rate = { kind: "calc", formula: p("basis.rate"), format: "number" };
        formula = `ROUND(${p("basis.rate")}*${ctx.input("quantities.grossSquareFeet")},2)`;
      } else if (basis?.type === "per_unit") {
        rate = { kind: "calc", formula: p("basis.rate"), format: "number" };
        formula = `ROUND(${p("basis.rate")}*${ctx.input("quantities.units")},2)`;
      } else if (basis?.type === "percent_of_line") {
        rate = { kind: "calc", formula: p("basis.percent"), format: "percent_number" };
        const baseRow = rowNumber(FIRST_LINE_ROW + line.basePosition!);
        formula = `ROUND(${columnLetter(COLUMN.amount)}${baseRow}*${p("basis.percent")}/100,2)`;
      } else {
        rate = { kind: "calc", formula: p("basis.percent"), format: "percent_number" };
        formula = sheetRef(settleSheet, cellAddress(rowIndex, settleColumn(rounds)));
      }
      amount = { kind: "output", id: `${id}.amount`, format: "money", engineValue: line.schedule.amount, formula };
      firstMonth = { kind: "calc", format: "date", formula: anchoredDate(ctx, entered.startAnchor, `costLines.${k}.startAnchor`, `costLines.${k}.startMonth`) };
      const end = entered.endAnchor;
      const endAnchor = end && "milestoneId" in end ? end : undefined;
      lastMonth = {
        kind: "calc",
        format: "date",
        formula: end && "durationMonths" in end
          ? `EDATE(${columnLetter(COLUMN.first)}${row},${p("endAnchor.durationMonths")}-1)`
          : anchoredDate(ctx, endAnchor, `costLines.${k}.endAnchor`, `costLines.${k}.endMonth`),
      };
    } else {
      const derived = line.derived!;
      const space = (path: string) => ctx.input(`commercial.spaces.${derived.spaceIndex}.${path}`);
      category = { kind: "text", text: CATEGORY_LABELS[line.schedule.category], role: "label" };
      basisLabel = BASIS_LABELS.derived;
      curve = { kind: "text", text: CURVE_LABELS.straight_line, role: "label" };
      const lease = (inputs.commercial?.spaces ?? [])[derived.spaceIndex - 1];
      const leaseStart = anchoredDate(ctx, lease.leaseStartAnchor, `commercial.spaces.${derived.spaceIndex}.leaseStartAnchor`, `commercial.spaces.${derived.spaceIndex}.leaseStartMonth`);
      if (derived.kind === "tenant_improvement") {
        rate = { kind: "calc", formula: space("tenantImprovementPerSf"), format: "number" };
        amount = { kind: "output", id: `${id}.amount`, format: "money", engineValue: line.schedule.amount, formula: `ROUND(${space("areaSf")}*${space("tenantImprovementPerSf")},2)` };
      } else {
        // The commission reads the lease's scheduled rent, which is the rent roll LA-1950 writes as formulas.
        rate = { kind: "calc", formula: space("leasingCommissionPercent"), format: "percent_number" };
        amount = { kind: "output", id: `${id}.amount`, format: "money", engineValue: line.schedule.amount };
      }
      firstMonth = { kind: "calc", format: "date", formula: leaseStart };
      lastMonth = { kind: "calc", format: "date", formula: `${columnLetter(COLUMN.first)}${row}` };
    }

    const firstRef = `$${columnLetter(COLUMN.first)}${row}`;
    const lastRef = `$${columnLetter(COLUMN.last)}${row}`;
    const monthCells = monthKeys.map((month, monthPosition): LayoutCell => {
      const letter = columnLetter(COLUMN.firstMonth + monthPosition);
      const date = `${letter}$${rowNumber(HEADING_ROW)}`;
      const step = `(${letter}$${rowNumber(COUNT_ROW)}-${monthCount(firstRef)}+1)`;
      const before = `(${letter}$${rowNumber(COUNT_ROW)}-${monthCount(firstRef)})`;
      return {
        kind: "output",
        id: `${id}.${month}`,
        format: "money",
        engineValue: schedule.months[monthPosition].lineAmounts[line.schedule.lineId] ?? 0,
        formula: `IF(OR(${date}<${firstRef},${date}>${lastRef}),0,${cumulative(step, row)}-${cumulative(before, row)})`,
      };
    });
    const firstLetter = columnLetter(COLUMN.firstMonth);
    const lastLetter = columnLetter(COLUMN.firstMonth + monthKeys.length - 1);
    return {
      outlineLevel: 1,
      cells: [
        { kind: "text", text: line.schedule.name, role: "label" },
        category,
        { kind: "text", text: basisLabel, role: "label" },
        rate,
        amount,
        firstMonth,
        lastMonth,
        { kind: "calc", format: "count", formula: `${monthCount(`${columnLetter(COLUMN.last)}${row}`)}-${monthCount(`${columnLetter(COLUMN.first)}${row}`)}+1` },
        curve,
        { kind: "output", id: `${id}.total`, format: "money", engineValue: line.schedule.total, formula: `SUM(${firstLetter}${row}:${lastLetter}${row})` },
        ...monthCells,
      ],
    };
  });

  // --------------------------------------------------------------------- totals
  const firstLineRef = (letter: string) => `${letter}${rowNumber(FIRST_LINE_ROW)}:${letter}${rowNumber(lastLineRow)}`;
  const absoluteLineRange = (letter: string) => `$${letter}$${rowNumber(FIRST_LINE_ROW)}:$${letter}$${rowNumber(lastLineRow)}`;
  const categoryRange = absoluteLineRange(columnLetter(COLUMN.category));
  const sumColumns = [COLUMN.amount, COLUMN.total, ...monthKeys.map((_, i) => COLUMN.firstMonth + i)];

  const totalCells: Array<LayoutCell | null> = [{ kind: "text", text: "Total Project Costs", role: "label" }, null, null, null];
  const categoryCells = new Map<CostCategory, Array<LayoutCell | null>>(CATEGORIES.map((category): [CostCategory, Array<LayoutCell | null>] => [category, [{ kind: "text", text: CATEGORY_LABELS[category], role: "label" }, null, null, null]]));
  for (const column of sumColumns) {
    const letter = columnLetter(column);
    const monthPosition = column - COLUMN.firstMonth;
    const isMonth = monthPosition >= 0;
    const idSuffix = column === COLUMN.amount ? "amount" : column === COLUMN.total ? "total" : monthKeys[monthPosition];
    totalCells[column] = {
      kind: "output",
      id: `costs.total.${idSuffix}`,
      format: "money",
      engineValue: isMonth ? schedule.months[monthPosition].totalUses : schedule.totalUses,
      formula: `SUM(${firstLineRef(letter)})`,
    };
    for (const category of CATEGORIES) {
      categoryCells.get(category)![column] = {
        kind: "output",
        id: `costs.category.${category}.${idSuffix}`,
        format: "money",
        engineValue: isMonth ? schedule.months[monthPosition].usesByCategory[category] : schedule.totalsByCategory[category],
        formula: `SUMIF(${categoryRange},"${CATEGORY_LABELS[category]}",${firstLineRef(letter)})`,
      };
    }
  }
  // The columns between the figures stay empty.
  const pad = (cells: Array<LayoutCell | null>) => Array.from({ length: cells.length }, (_, i) => cells[i] ?? null);

  // ---------------------------------------------------------------------- sheet
  const rows: LayoutRow[] = header(source, "Cost Schedule");
  rows[COUNT_ROW] = {
    cells: [
      ...Array.from({ length: COLUMN.total }, () => null),
      { kind: "text", text: "Month Count", role: "note" },
      ...monthKeys.map((_, i): LayoutCell => ({ kind: "calc", format: "count", formula: monthCount(`${columnLetter(COLUMN.firstMonth + i)}${rowNumber(HEADING_ROW)}`) })),
    ],
  };
  const heading = (text: string): LayoutCell => ({ kind: "text", text, role: "column" });
  rows.push({
    cells: [
      heading("Cost Line"),
      heading("Category"),
      heading("Basis"),
      heading("Rate or Percent"),
      heading("Amount"),
      heading("First Month"),
      heading("Last Month"),
      heading("Months"),
      heading("Curve"),
      heading("Total"),
      ...monthKeys.map((month): LayoutCell => ({ kind: "date", value: `${month}-01` })),
    ],
  });
  rows.push({ cells: [{ kind: "text", text: "Cost Lines", role: "section" }] });
  rows.push(...lineRows);
  rows.push({ cells: [] });
  rows.push({ cells: [{ kind: "text", text: "Totals", role: "section" }] });
  rows.push({ cells: pad(totalCells) });
  rows.push({ cells: [] });
  rows.push({ cells: [{ kind: "text", text: "By Category", role: "section" }] });
  for (const category of CATEGORIES) rows.push({ outlineLevel: 1, cells: pad(categoryCells.get(category)!) });
  const financingCell: Extract<LayoutCell, { kind: "output" }> = { kind: "output", id: "costs.financing", format: "money", engineValue: financing };
  if (financed) {
    rows.push({ cells: [] });
    rows.push({ cells: [{ kind: "text", text: "From the Funding Plan", role: "section" }] });
    rows.push({ cells: [{ kind: "text", text: "Financing Counted in Percent of Total Lines", role: "label" }, null, null, null, financingCell] });
  }
  const notes = [
    "Month figures follow the cost schedule: a line spreads its amount over its months by its curve, and the last month takes what is left after rounding.",
    ...(lines.some(({ derived }) => derived?.kind === "leasing_commission")
      ? ["A leasing commission is gray because it reads the lease's scheduled rent, which becomes formulas with the operations issue (LA-1950)."]
      : []),
    ...(financed ? ["Financing is the loan fees, operating shortfall and capitalized interest on the Monthly sheet. A percent of total line counts it, and the loan counts that line, so a loan written as formulas (LA-1951) closes a circle that Excel must iterate."] : []),
  ];
  rows.push({ cells: [] });
  for (const note of notes) rows.push({ cells: [{ kind: "text", text: note, role: "note" }] });

  const costs: LayoutSheet = {
    name: SHEET_NAMES.costs,
    columnWidths: [40, 16, 28, 16, 16, 13, 13, 9, 15, 16, ...monthKeys.map(() => 13)],
    frozen: { rows: HEADER_ROWS + 1, columns: 2 },
    rows,
  };

  // ------------------------------------------------------------ percent settling
  let settling: LayoutSheet | null = null;
  if (potLines.length > 0) {
    const settleRows: LayoutRow[] = header(source, "Percent of Total Settling");
    settleRows.push({
      cells: [
        heading("Cost Line"),
        ...Array.from({ length: rounds + 1 }, (_, round): LayoutCell => heading(round === 0 ? "Start" : `Round ${round}`)),
      ],
    });
    settleRows.push({ cells: [{ kind: "text", text: "Each round is every line's amount after the percent-of-total lines take their share of the round before.", role: "note" }] });
    const costsAmount = (position: number) => sheetRef(SHEET_NAMES.costs, absoluteAddress(FIRST_LINE_ROW + position, COLUMN.amount));
    const costsCategory = (fromPosition: number, toPosition: number) => sheetRef(
      SHEET_NAMES.costs,
      `${absoluteAddress(FIRST_LINE_ROW + fromPosition, COLUMN.category)}:${absoluteAddress(FIRST_LINE_ROW + toPosition, COLUMN.category)}`,
    );
    const financingRef = sheetRef(SHEET_NAMES.costs, absoluteAddress(financingRow, COLUMN.amount));
    for (const line of lines) {
      const rowIndex = FIRST_LINE_ROW + line.position;
      const cells: LayoutCell[] = [{ kind: "text", text: line.schedule.name, role: "label" }];
      for (let round = 0; round <= rounds; round += 1) {
        const column = settleColumn(round);
        const cellAt = (position: number, atColumn = column) => cellAddress(FIRST_LINE_ROW + position, atColumn);
        let formula: string;
        if (line.potBase) {
          if (round === 0) formula = "0";
          else {
            const previous = settleColumn(round - 1);
            const part = (fromPosition: number, toPosition: number) => {
              if (fromPosition > toPosition) return [];
              const sum = `${columnLetter(previous)}${rowNumber(FIRST_LINE_ROW + fromPosition)}:${columnLetter(previous)}${rowNumber(FIRST_LINE_ROW + toPosition)}`;
              const category = costsCategory(fromPosition, toPosition);
              if (line.potBase === "total_cost") return [`SUM(${sum})`];
              if (line.potBase === "total_less_land") return [`SUMIF(${category},"<>Land",${sum})`];
              return [`SUMIF(${category},"Hard Cost",${sum})`, `SUMIF(${category},"Soft Cost",${sum})`];
            };
            const terms = [...part(0, line.position - 1), ...part(line.position + 1, count - 1), ...(line.potBase === "hard_and_soft" ? [] : [financingRef])];
            formula = `ROUND((${terms.join("+")})*${percentName(line)}/100,2)`;
          }
        } else if (line.dependent) {
          formula = `ROUND(${cellAt(line.basePosition!)}*${percentName(line)}/100,2)`;
        } else {
          formula = costsAmount(line.position);
        }
        cells.push({ kind: "calc", formula, format: "money" });
      }
      settleRows[rowIndex] = { outlineLevel: 1, cells };
    }
    settling = {
      name: settleSheet,
      columnWidths: [40, ...Array.from({ length: rounds + 1 }, () => 15)],
      frozen: { rows: HEADER_ROWS + 1, columns: 1 },
      rows: settleRows,
    };
  }

  const monthTotalRow = rowNumber(totalRow);
  return {
    costs,
    settling,
    schedule,
    refs: {
      monthTotal: (monthPosition) => sheetRef(SHEET_NAMES.costs, `${columnLetter(COLUMN.firstMonth + monthPosition)}${monthTotalRow}`),
      total: sheetRef(SHEET_NAMES.costs, `${columnLetter(COLUMN.total)}${monthTotalRow}`),
      land: sheetRef(SHEET_NAMES.costs, `${columnLetter(COLUMN.total)}${rowNumber(categoryRow("land"))}`),
      linkFinancing: (formula) => {
        if (financed) financingCell.formula = formula;
      },
    },
  };
}
