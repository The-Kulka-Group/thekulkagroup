import type { ApartmentOperationsResult, MonthlyApartmentOperations, PropertyReturnsInputs } from "@kulka/engine";

import {
  HEADER_ROWS,
  SHEET_NAMES,
  anchoredDate,
  columnLetter,
  dateOfMonthText,
  header,
  monthCount,
  sheetRef,
  type CellFormat,
  type LayoutCell,
  type LayoutContext,
  type LayoutRow,
  type LayoutSheet,
} from "./frame";

// LA-1950. Operations through net operating income as live formulas, following
// apartment-operations.ts, commercial-operations.ts and property-tax.ts. Each month is a column.
// A row is either an output (it carries the engine's figure, which the LibreOffice check compares)
// or a working row (a step the engine does not report, such as one unit type's grown rent).
// Money works in whole cents where the engine does, so a rounding lands on the same cent.

const FIRST_MONTH_COLUMN = 2;
const HEADING_ROW = HEADER_ROWS;

type Col = {
  position: number;
  letter: string;
  first: boolean;
  /** The month's heading date, with its row anchored. */
  date: string;
  /** A row's cell in this month's column. */
  cell: (key: string) => string;
  /** The same row one month earlier, or null in the first month. */
  prev: (key: string) => string | null;
  /** A row from the first month through the month before this one, or null in the first month. */
  prevRange: (key: string) => string | null;
  /** A row from the first month through this one. */
  toHere: (key: string) => string;
  /** A scalar cell, absolute. */
  S: (key: string) => string;
};

type Scalar = { kind: "scalar"; key: string; label: string; format: CellFormat; engine?: number };
type Row = {
  kind: "row";
  key: string;
  label: string;
  format: CellFormat;
  formula: (c: Col) => string;
  /** Present on an output row: the engine's figure for the month. */
  engine?: (month: MonthlyApartmentOperations) => number;
  total?: number;
};
type Def = { kind: "section"; title: string } | { kind: "blank" } | Scalar | Row;

export type OperationsBuild = {
  sheet: LayoutSheet;
  /** An operations row in one month, for another sheet to read. */
  cell: (key: string, monthPosition: number) => string;
  /** A scalar on the sheet, absolute, for another sheet to read. */
  scalar: (key: string) => string;
  /** The commercial rent growth factor for a cell holding years elapsed since the growth start. */
  commercialGrowth: (periods: string) => string;
};

export const alloc = (annual: string, position: string) => `(IF(${position}=11,${annual},ROUND(${annual}*(${position}+1)/12,0))-ROUND(${annual}*${position}/12,0))`;
const cents = (x: string) => `ROUND(${x}*100,0)`;
const percentOf = (x: string, percent: string) => `ROUND(${cents(x)}*${percent}/100,0)/100`;
const sum = (terms: string[]) => (terms.length === 0 ? "0" : terms.join("+"));

/** Compounds year one's rate, then year two's, with the last rate carrying forward (growthFactor in apartment-operations.ts). */
function growthExpression(rates: string[], periods: string) {
  const last = rates.length - 1;
  const listed = rates.slice(0, last).map((rate, index) => `IF(${periods}>=${index + 1},1+${rate}/100,1)`);
  return [...listed, `(1+${rates[last]}/100)^(${periods}-MIN(${periods},${last}))`].join("*");
}

export function buildOperationsSheet(ctx: LayoutContext, operations: ApartmentOperationsResult): OperationsBuild {
  const { source } = ctx;
  const inputs = source.inputs as PropertyReturnsInputs;
  const months = operations.months;
  const n = (path: string) => ctx.input(path);
  const optional = (path: string, otherwise: string) => (ctx.has(path) ? ctx.input(path) : otherwise);
  const defs: Def[] = [];
  const section = (title: string) => defs.push({ kind: "section", title });
  const blank = () => defs.push({ kind: "blank" });
  const row = (key: string, label: string, format: CellFormat, formula: (c: Col) => string, engine?: (month: MonthlyApartmentOperations) => number, total = false) =>
    defs.push({ kind: "row", key, label, format, formula, engine, total: total ? 1 : undefined });
  const money = (key: keyof MonthlyApartmentOperations & string, label: string, formula: (c: Col) => string) =>
    row(key, label, "money", formula, (month) => month[key as "netOperatingIncome"], true);

  const unitTypes = inputs.residentialUnitTypes;
  const otherIncome = inputs.otherIncomeLines;
  const expenses = inputs.operatingExpenseLines;
  const capital = inputs.capitalExpenditureLines;
  const commercial = inputs.commercial;
  const spaces = commercial?.spaces ?? [];
  const tax = inputs.propertyTax;
  const turnover = inputs.leaseTurnover;
  const concession = inputs.leaseUpConcession;
  const seasonal = inputs.seasonalAbsorption;
  const rule = inputs.stabilizationRule;
  const isCommercialLine = (line: { appliesTo?: string }) => line.appliesTo === "commercial";

  const rowNumbers = new Map<string, number>();
  const S = (key: string) => `$B$${rowNumbers.get(key)!}`;

  // Scalars are collected as closures and resolved once every row has a number.
  const scalarDefs: Array<{ key: string; label: string; format: CellFormat; build: (S: (key: string) => string) => string; engine?: number }> = [];
  const sc = (key: string, label: string, format: CellFormat, build: (S: (key: string) => string) => string, engine?: number) => scalarDefs.push({ key, label, format, build, engine });

  // ------------------------------------------------------------------- summary
  const off = (c: Col) => c.cell("offset");
  const I = {
    preleased: n("preleasedUnits"),
    pace: n("leaseUpUnitsPerMonth"),
    rentAdjustment: n("rentAdjustmentLossPercent"),
    freeRent: n("freeRentPercent"),
    vacancy: n("vacancyPercent"),
    creditLoss: n("creditLossPercent"),
  };

  const atTarget = (c: Col, units: string) => `IF(AND(${c.S("s.revenueUnits")}>0,${units}*100>=${c.S("s.target")}*${c.S("s.revenueUnits")}-0.000000001),1,0)`;

  section("Units");
  row("revenueUnits", "Revenue Units", "number", (c) => `IF(${off(c)}<0,0,${c.S("s.revenueUnits")})`, (m) => m.revenueUnits);
  row("leasedUnits", "Leased Units", "number", (c) => `IF(${off(c)}<0,0,IF(${off(c)}=0,${I.preleased},IF(ABS(${c.cell("staying")}+${c.cell("newLeases")}-${c.S("s.ceiling")})<0.000000001,${c.S("s.ceiling")},${c.cell("staying")}+${c.cell("newLeases")})))`, (m) => m.leasedUnits);
  row("turnedUnits", "Turned Units", "number", (c) => (turnover ? `IF(${off(c)}<1,0,ROUND(${c.cell("turnTenThousandths")}/10000,0)-ROUND(${c.prev("turnTenThousandths") ?? "0"}/10000,0))` : "0"), (m) => m.turnedUnits);
  row("occupiedUnits", "Occupied Units", "number", (c) => c.cell("leasedUnits"), (m) => m.occupiedUnits);
  row("leaseUpPercent", "Lease-Up Percent", "rate", (c) => `IF(${off(c)}<0,0,${c.cell("leasedUnits")}/${c.S("s.revenueUnits")})`, (m) => m.leaseUpPercent);

  blank();
  section("Residential Income");
  const rentTerms = (c: Col, field: "units" | "nonRevenueUnits") => sum(unitTypes.map((_, i) => `${c.cell(`rent.${i + 1}`)}*${n(`residentialUnitTypes.${i + 1}.${field}`)}`));
  money("residentialGrossRent", "Residential Gross Rent", (c) => `IF(${off(c)}<0,0,(${rentTerms(c, "units")})/100)`);
  money("nonRevenueRentAdjustment", "Non-Revenue Unit Adjustment", (c) => `IF(${off(c)}<0,0,-(${rentTerms(c, "nonRevenueUnits")})/100)`);
  money("leaseUpLoss", "Lease-Up Loss", (c) => `IF(${off(c)}<0,0,-ROUND(${c.cell("revenueRent")}*(${c.S("s.revenueUnits")}-${c.cell("leasedUnits")})/${c.S("s.revenueUnits")},2))`);
  money("rentAdjustmentLoss", "Rent Adjustment Loss", (c) => `IF(${off(c)}<0,0,-${percentOf(c.cell("occupiedRent"), I.rentAdjustment)})`);
  money("freeRentLoss", "Free Rent Loss", (c) => `IF(${off(c)}<0,0,-${percentOf(c.cell("occupiedRent"), I.freeRent)})`);
  money("leaseUpConcessionLoss", "Lease-Up Concession Loss", (c) => (concession ? `IF(${off(c)}<0,0,-ROUND(${c.cell("revenueRent")}*${c.cell("concessionUnits")}/${c.S("s.revenueUnits")},2))` : "0"));
  money("totalResidentialRent", "Total Residential Rent", (c) => `${c.cell("occupiedRent")}+${c.cell("rentAdjustmentLoss")}+${c.cell("freeRentLoss")}+${c.cell("leaseUpConcessionLoss")}`);
  money("otherIncome", "Other Income", (c) => sum(otherIncome.map((_, i) => c.cell(`oi.${i + 1}`))));
  money("totalPotentialIncome", "Total Potential Income", (c) => `${c.cell("totalResidentialRent")}+${c.cell("otherIncome")}`);
  money("vacancyLoss", "Vacancy Loss", (c) => `IF(${off(c)}<0,0,-(${c.cell("cumulativeVacancy")}-IF(MOD(${off(c)},12)=0,0,${c.prev("cumulativeVacancy") ?? "0"})))`);
  money("creditLoss", "Credit Loss", (c) => `IF(${off(c)}<0,0,-(${c.cell("cumulativeCredit")}-IF(MOD(${off(c)},12)=0,0,${c.prev("cumulativeCredit") ?? "0"})))`);

  if (commercial) {
    blank();
    section("Commercial");
    money("commercialBaseRent", "Commercial Base Rent", (c) => sum(spaces.map((_, s) => c.cell(`base.${s + 1}`))));
    money("commercialFreeRent", "Commercial Free Rent", (c) => sum(spaces.map((_, s) => c.cell(`free.${s + 1}`))));
    money("commercialRecoveries", "Commercial Recoveries", (c) => sum(spaces.flatMap((space, s) => space.recoveries.map((_, r) => c.cell(`recovered.${s + 1}.${r + 1}`)))));
    money("commercialVacancyLoss", "Commercial Vacancy Loss", (c) => `-${percentOf(`(${c.cell("commercialRent")}+${c.cell("commercialRecoveries")})`, n("commercial.vacancyPercent"))}`);
    money("commercialCreditLoss", "Commercial Credit Loss", (c) => `-${percentOf(`(${c.cell("commercialRent")}+${c.cell("commercialRecoveries")})`, n("commercial.creditLossPercent"))}`);
    money("commercialEffectiveGrossRevenue", "Commercial Effective Gross Revenue", (c) => `${c.cell("commercialRent")}+${c.cell("commercialRecoveries")}+${c.cell("commercialVacancyLoss")}+${c.cell("commercialCreditLoss")}`);
    money("commercialOperatingExpenses", "Commercial Operating Expenses", (c) => `${c.cell("taggedExpenses")}+${c.cell("billedSharedCosts")}`);
    money("commercialNetOperatingIncome", "Commercial Net Operating Income", (c) => `${c.cell("commercialEffectiveGrossRevenue")}-${c.cell("commercialOperatingExpenses")}`);
  }

  blank();
  section("Net Operating Income");
  money("effectiveGrossRevenue", "Effective Gross Revenue", (c) => `${c.cell("residentialEgr")}${commercial ? `+${c.cell("commercialEffectiveGrossRevenue")}` : ""}`);
  money("operatingExpenses", "Operating Expenses", (c) => `${tax ? `${c.cell("propertyTax")}+` : ""}${c.cell("residentialExpenses")}+${c.cell("taggedExpenses")}`);
  if (tax) {
    money("propertyTax", "Property Tax", (c) => `IF(${off(c)}<0,0,${c.cell("taxScheduled")})`);
    money("fullPropertyTax", "Property Tax With No Abatement", (c) => `IF(${off(c)}<0,0,${c.cell("taxFull")})`);
  }
  money("netOperatingIncome", "Net Operating Income", (c) => `${c.cell("effectiveGrossRevenue")}-${c.cell("operatingExpenses")}`);
  money("capitalExpenditures", "Capital Expenditures", (c) => sum(capital.map((_, i) => c.cell(`cx.${i + 1}`))));
  money("operatingCashFlow", "Operating Cash Flow", (c) => `${c.cell("netOperatingIncome")}-${c.cell("capitalExpenditures")}`);
  if (commercial) {
    money("residentialNetOperatingIncome", "Residential Net Operating Income", (c) => `${c.cell("residentialEgr")}-(${tax ? `${c.cell("propertyTax")}+` : ""}${c.cell("residentialExpenses")}-${c.cell("billedSharedCosts")})`);
  } else {
    money("residentialNetOperatingIncome", "Residential Net Operating Income", (c) => c.cell("netOperatingIncome"));
  }

  // -------------------------------------------------------------- property scalars
  const unitSum = (field: string) => sum(unitTypes.map((_, i) => n(`residentialUnitTypes.${i + 1}.${field}`)));
  sc("s.totalUnits", "Total Units", "number", () => unitSum("units"), operations.unitSummary.totalUnits);
  sc("s.nonRevenueUnits", "Non-Revenue Units", "number", () => unitSum("nonRevenueUnits"), operations.unitSummary.nonRevenueUnits);
  sc("s.revenueUnits", "Revenue Units", "number", (S) => `${S("s.totalUnits")}-${S("s.nonRevenueUnits")}`, operations.unitSummary.revenueUnits);
  sc("s.totalAreaSf", "Residential Area (SF)", "number", () => sum(unitTypes.map((_, i) => `${n(`residentialUnitTypes.${i + 1}.averageAreaSf`)}*${n(`residentialUnitTypes.${i + 1}.units`)}`)), operations.unitSummary.totalAreaSf);
  sc("s.opStart", "Operation Start (Month Count)", "number", () => monthCount(anchoredDate(ctx, inputs.operationStartAnchor, "operationStartAnchor", "operationStartMonth")));
  sc("s.growthStart", "Growth Start (Month Count)", "number", () => monthCount(anchoredDate(ctx, inputs.growthStartAnchor, "growthStartAnchor", "growthStartMonth")));
  sc("s.cap", "Share of Revenue Units That Can Lease (Percent)", "percent_number", () => (inputs.occupancyCap ? `100-${I.vacancy}` : "100"));
  sc("s.ceiling", "Most Units That Can Be Leased", "number", (S) => `${S("s.revenueUnits")}*${S("s.cap")}/100`);
  sc("s.target", "Stabilization Target (Percent)", "percent_number", (S) => (rule ? n("stabilizationRule.targetOccupancyPercent") : S("s.cap")));
  sc("s.hold", "Stabilization Hold (Months)", "number", () => (rule ? n("stabilizationRule.holdMonths") : "1"));
  if (commercial) {
    sc("s.commercialArea", "Commercial Area (SF)", "number", () => sum(spaces.map((_, s) => n(`commercial.spaces.${s + 1}.areaSf`))));
    sc("s.allocationArea", "Area Shares Divide By (SF)", "number", (S) => `${S("s.totalAreaSf")}+${S("s.commercialArea")}`);
    spaces.forEach((space, s) => {
      const p = (path: string) => n(`commercial.spaces.${s + 1}.${path}`);
      sc(`s.leaseStart.${s + 1}`, `${space.name}: Lease Start (Month Count)`, "number", () => monthCount(anchoredDate(ctx, space.leaseStartAnchor, `commercial.spaces.${s + 1}.leaseStartAnchor`, `commercial.spaces.${s + 1}.leaseStartMonth`)));
      sc(`s.annualRent.${s + 1}`, `${space.name}: Annual Rent (Cents)`, "number", () => `ROUND(${p("areaSf")}*${p("annualRentPerSf")}*100,0)`);
      space.recoveries.forEach((recovery, r) => {
        const entered = ctx.has(`commercial.spaces.${s + 1}.recoveries.${r + 1}.sharePercent`);
        sc(`s.share.${s + 1}.${r + 1}`, `${space.name}: Recovery ${r + 1} Share (Percent)`, "percent_number", (S) => (entered ? p(`recoveries.${r + 1}.sharePercent`) : `${p("areaSf")}/${S("s.allocationArea")}*100`));
      });
    });
    sc("s.firstLease", "First Lease Start (Month Count)", "number", (S) => `MIN(${spaces.map((_, s) => S(`s.leaseStart.${s + 1}`)).join(",")})`);
  }

  // ------------------------------------------------------------------ timeline
  blank();
  section("Timeline");
  row("count", "Month Count", "number", (c) => monthCount(c.date));
  row("offset", "Months From Operation Start", "number", (c) => `${c.cell("count")}-${c.S("s.opStart")}`);
  row("periods", "Growth Years Elapsed", "number", (c) => `IF(${c.cell("count")}<${c.S("s.growthStart")},0,INT((${c.cell("count")}-${c.S("s.growthStart")})/12))`);

  // -------------------------------------------------------------------- growth
  blank();
  section("Growth Factors");
  const growth = inputs.categoryGrowth;
  const listOf = (category: string, count: number) => Array.from({ length: count }, (_, i) => n(`categoryGrowth.${category}.${i + 1}`));
  const rates = {
    market: growth ? listOf("marketRentPercent", growth.marketRentPercent.length) : [n("annualIncomeGrowthPercent")],
    affordable: growth ? listOf("affordableRentPercent", growth.affordableRentPercent.length) : [n("annualIncomeGrowthPercent")],
    other: growth ? listOf("otherIncomePercent", growth.otherIncomePercent.length) : [n("annualIncomeGrowthPercent")],
    expense: growth ? listOf("operatingExpensePercent", growth.operatingExpensePercent.length) : [n("annualExpenseGrowthPercent")],
    commercial: growth
      ? growth.commercialRentPercent ? listOf("commercialRentPercent", growth.commercialRentPercent.length) : listOf("marketRentPercent", growth.marketRentPercent.length)
      : [n("annualIncomeGrowthPercent")],
  };
  row("g.market", "Market Rent Growth Factor", "number", (c) => growthExpression(rates.market, c.cell("periods")));
  row("g.affordable", "Affordable Rent Growth Factor", "number", (c) => growthExpression(rates.affordable, c.cell("periods")));
  row("g.other", "Other Income Growth Factor", "number", (c) => growthExpression(rates.other, c.cell("periods")));
  row("g.expense", "Operating Expense Growth Factor", "number", (c) => growthExpression(rates.expense, c.cell("periods")));
  if (commercial) row("g.commercial", "Commercial Rent Growth Factor", "number", (c) => growthExpression(rates.commercial, c.cell("periods")));

  // ------------------------------------------------------------------- lease-up
  blank();
  section("Lease-Up");
  if (seasonal) {
    row("season", "Seasonal Absorption Factor", "number", (c) => `CHOOSE(MOD(${c.cell("count")}-1,12)+1,${seasonal.monthlyFactors.map((_, i) => n(`seasonalAbsorption.monthlyFactors.${i + 1}`)).join(",")})`);
  }
  row("absorbed", "Absorbed Units (Ten Thousandths)", "number", (c) => `IF(${off(c)}<=0,0,${c.prev("absorbed") ?? "0"}+ROUND(${I.pace}*${seasonal ? c.cell("season") : "1"}*10000,0))`);
  row("pace", "Units Absorbed This Month", "number", (c) => `IF(${off(c)}<=0,0,ROUND(${c.cell("absorbed")}/10000,0)-ROUND(${c.prev("absorbed") ?? "0"}/10000,0))`);
  if (turnover) {
    const term = n("leaseTurnover.leaseTermMonths");
    const basis = n("leaseTurnover.basis");
    const at = (c: Col, key: string, start: string) => (c.prevRange(key) ? `SUMIFS(${c.prevRange(key)},${c.prevRange("offset")},${start})` : "0");
    row("expiring", "Leases Reaching the End of a Term", "number", (c) => {
      const start = `(${off(c)}-${term})`;
      const once = at(c, "signed", start);
      const every = `${once}+${at(c, "renewed", start)}`;
      const gained = `MAX(0,${at(c, "leasedUnits", start)}-IF(${start}=0,0,${at(c, "leasedUnits", `${start}-1`)}))`;
      return `IF(OR(${off(c)}<1,${off(c)}<${term}),0,IF(${basis}="each_new_lease_once",${once},IF(${basis}="every_expiring_lease",${every},${gained})))`;
    });
    row("turnTenThousandths", "Turned Units (Ten Thousandths)", "number", (c) => `IF(${off(c)}<1,0,${c.prev("turnTenThousandths") ?? "0"}+IF(AND(${c.prev("reached") ?? "0"}=0,${c.cell("expiring")}>0),ROUND(${c.cell("expiring")}*${n("leaseTurnover.turnoverPercent")}*100,0),0))`);
    row("stillVacant", "Units Still Vacant After Turning", "number", (c) => {
      const earlier = c.prevRange("turnedUnits") ? `SUMIFS(${c.prevRange("turnedUnits")},${c.prevRange("offset")},">="&MAX(1,${off(c)}-${n("leaseTurnover.vacantMonths")}+1))` : "0";
      return `IF(${off(c)}<1,0,IF(${n("leaseTurnover.vacantMonths")}>0,${c.cell("turnedUnits")}+${earlier},0))`;
    });
    row("renewed", "Leases Renewed", "number", (c) => `IF(${off(c)}<1,0,${c.cell("expiring")}-${c.cell("turnedUnits")})`);
  }
  row("staying", "Units Staying From the Month Before", "number", (c) => `IF(${off(c)}<=0,0,${c.prev("leasedUnits") ?? "0"}-${c.cell("turnedUnits")})`);
  row("newLeases", "New Leases Signed", "number", (c) => `IF(${off(c)}<=0,0,MIN(${c.cell("pace")},MAX(0,${c.S("s.ceiling")}-${c.cell("staying")}-${turnover ? c.cell("stillVacant") : "0"})))`);
  row("signed", "Leases Signed, Pre-Leased in the First Month", "number", (c) => `IF(${off(c)}<0,0,IF(${off(c)}=0,${I.preleased},${c.cell("newLeases")}))`);
  row("reached", "Stabilization Target Reached", "number", (c) => `IF(${off(c)}<0,0,MAX(${c.prev("reached") ?? "0"},${atTarget(c, c.cell("leasedUnits"))}))`);
  row("held", "Months Held at the Target", "number", (c) => `IF(${off(c)}<0,0,IF(${atTarget(c, c.cell("leasedUnits"))}=1,${c.prev("held") ?? "0"}+1,0))`);
  row("stabilized", "Stabilized", "number", (c) => `IF(${off(c)}<0,0,MAX(${c.prev("stabilized") ?? "0"},IF(${c.cell("held")}>=${c.S("s.hold")},1,0)))`);
  if (concession) {
    const months = n("leaseUpConcession.monthsFree");
    row("concessionUnits", "Leased Units Whose Rent the Concession Forgoes", "number", (c) => {
      const age = `(${off(c)}-${c.toHere("offset")})`;
      if (concession.timing === "at_move_in") {
        const left = `(${months}-${age})`;
        return `SUMPRODUCT(${c.toHere("signed")},(${left}>=1)+(${left}>0)*(${left}<1)*${left})`;
      }
      return `SUMPRODUCT(${c.toHere("signed")}*(${age}<${n("leaseUpConcession.leaseTermMonths")}))*${months}/${n("leaseUpConcession.leaseTermMonths")}`;
    });
  }

  // ------------------------------------------------------------------ rent rows
  blank();
  section("Residential Rent");
  unitTypes.forEach((line, i) => {
    const k = i + 1;
    const growthFactor = (c: Col) => (ctx.has(`residentialUnitTypes.${k}.affordabilityTier`)
      ? `IF(${n(`residentialUnitTypes.${k}.affordabilityTier`)}="market",${c.cell("g.market")},${c.cell("g.affordable")})`
      : c.cell("g.market"));
    row(`rent.${k}`, `${line.name}: Monthly Rent Per Unit (Cents)`, "number", (c) => `IF(${off(c)}<0,0,ROUND(${cents(n(`residentialUnitTypes.${k}.monthlyMarketRent`))}*${growthFactor(c)},0))`);
  });
  row("revenueRent", "Rent of the Revenue Units", "money", (c) => `${c.cell("residentialGrossRent")}+${c.cell("nonRevenueRentAdjustment")}`);
  row("occupiedRent", "Rent of the Leased Units", "money", (c) => `${c.cell("revenueRent")}+${c.cell("leaseUpLoss")}`);

  // --------------------------------------------------------- other income, losses
  blank();
  section("Other Income Lines");
  const annualLine = (key: string, label: string, amount: string, growthKey: string, perUnit: boolean) =>
    row(`${key}A`, `${label}: Grown Annual Amount (Cents)`, "number", (c) => `ROUND(${cents(amount)}*${c.cell(growthKey)},0)${perUnit ? `*${c.S("s.totalUnits")}` : ""}`);
  const annualMonth = (c: Col, key: string, offsetRef: string) => alloc(c.cell(`${key}A`), `MOD(${offsetRef},12)`);
  const variableMonth = (monthCents: string, share: string, occupancy: string) => (share === "0"
    ? monthCents
    : `IF(OR(${share}=0,${occupancy}>=1),${monthCents},ROUND(${monthCents}*(1-${share}/100+${share}/100*${occupancy}),0))`);
  otherIncome.forEach((line, i) => {
    const k = i + 1;
    const amount = n(`otherIncomeLines.${k}.amount`);
    if (line.unit === "usd_per_occupied_unit_month") {
      row(`oi.${k}`, line.name, "money", (c) => `IF(${off(c)}<0,0,ROUND(ROUND(${cents(amount)}*${c.cell("g.other")},0)*${c.cell("leasedUnits")},0)/100)`);
      return;
    }
    annualLine(`oi.${k}`, line.name, amount, "g.other", false);
    row(`oi.${k}`, line.name, "money", (c) => `IF(${off(c)}<0,0,${annualMonth(c, `oi.${k}`, off(c))}/100)`);
  });

  blank();
  section("Vacancy and Credit Loss Working");
  row("potentialYearToDate", "Potential Income Year to Date", "money", (c) => `IF(${off(c)}<0,0,IF(MOD(${off(c)},12)=0,0,${c.prev("potentialYearToDate") ?? "0"})+${c.cell("totalPotentialIncome")})`);
  row("cumulativeVacancy", "Vacancy Loss Year to Date", "money", (c) => (inputs.occupancyCap ? "0" : `IF(${off(c)}<0,0,${percentOf(c.cell("potentialYearToDate"), I.vacancy)})`));
  row("cumulativeCredit", "Credit Loss Year to Date", "money", (c) => `IF(${off(c)}<0,0,${percentOf(c.cell("potentialYearToDate"), I.creditLoss)})`);
  row("residentialEgr", "Residential Effective Gross Revenue", "money", (c) => `${c.cell("totalPotentialIncome")}+${c.cell("vacancyLoss")}+${c.cell("creditLoss")}`);

  // ----------------------------------------------------------------- commercial
  if (commercial) {
    blank();
    section("Commercial Spaces");
    spaces.forEach((space, s) => {
      const k = s + 1;
      row(`base.${k}`, `${space.name}: Base Rent`, "money", (c) => `IF(${c.cell("count")}<${c.S(`s.leaseStart.${k}`)},0,${alloc(`ROUND(${c.S(`s.annualRent.${k}`)}*${c.cell("g.commercial")},0)`, `MOD(${off(c)},12)`)}/100)`);
      row(`free.${k}`, `${space.name}: Free Rent`, "money", (c) => `IF(AND(${c.cell("count")}>=${c.S(`s.leaseStart.${k}`)},${c.cell("count")}-${c.S(`s.leaseStart.${k}`)}<${n(`commercial.spaces.${k}.freeRentMonths`)}),-${c.cell(`base.${k}`)},0)`);
    });
    row("commercialRent", "Commercial Rent After Free Rent", "money", (c) => `${c.cell("commercialBaseRent")}+${c.cell("commercialFreeRent")}`);
    row("commercialRentLoss", "Commercial Vacancy and Credit Loss on Rent Alone", "money", (c) => `${percentOf(c.cell("commercialRent"), n("commercial.vacancyPercent"))}+${percentOf(c.cell("commercialRent"), n("commercial.creditLossPercent"))}`);
    spaces.forEach((space, s) => {
      space.recoveries.forEach((recovery, r) => {
        const ids = recovery.basis.kind === "expense_lines" ? recovery.basis.lineIds.map((id) => expenses.findIndex((line) => line.id === id) + 1) : [];
        const basis = recovery.basis.kind === "property_tax" ? (c: Col) => c.cell("taxScheduled") : (c: Col) => sum(ids.map((j) => c.cell(`ex.${j}`)));
        const shared = recovery.basis.kind === "property_tax"
          ? (c: Col) => c.cell("taxScheduled")
          : (c: Col) => sum(ids.filter((j) => !isCommercialLine(expenses[j - 1])).map((j) => c.cell(`ex.${j}`)));
        const started = (c: Col) => `AND(${off(c)}>=0,${c.cell("count")}>=${c.S(`s.leaseStart.${s + 1}`)})`;
        row(`recovered.${s + 1}.${r + 1}`, `${space.name}: Recovery ${r + 1}`, "money", (c) => `IF(${started(c)},ROUND(${cents(`(${basis(c)})`)}*${c.S(`s.share.${s + 1}.${r + 1}`)}/100,0)/100,0)`);
        row(`billed.${s + 1}.${r + 1}`, `${space.name}: Recovery ${r + 1} Billed on Shared Costs`, "money", (c) => `IF(${started(c)},MIN(${c.cell(`recovered.${s + 1}.${r + 1}`)},ROUND(${cents(`(${shared(c)})`)}*${c.S(`s.share.${s + 1}.${r + 1}`)}/100,0)/100),0)`);
      });
    });
    row("billedSharedCosts", "Shared Costs Billed to Tenants", "money", (c) => sum(spaces.flatMap((space, s) => space.recoveries.map((_, r) => c.cell(`billed.${s + 1}.${r + 1}`)))));
  }

  // --------------------------------------------------------------- property tax
  if (tax) {
    blank();
    section("Property Tax Working");
    const t = (path: string) => n(`propertyTax.${path}`);
    const years = tax.fiscalYears.length;
    const pick = (field: string, absent: string) => (c: Col) => `CHOOSE(${c.cell("taxYear")}+1,${tax.fiscalYears.map((year, i) => (field in year ? t(`fiscalYears.${i + 1}.${field}`) : absent)).join(",")})`;
    const hasPayment = tax.mode === "abatement" && tax.fiscalYears.some((year) => year.statedPayment !== undefined);
    sc("s.taxStart", "First Fiscal Year Starts (Month Count)", "number", () => monthCount(dateOfMonthText(t("firstFiscalYearStartMonth"))));
    row("taxYear", "Tax Fiscal Year (Zero Based)", "number", (c) => `IF(${off(c)}<0,0,INT((${c.cell("count")}-${c.S("s.taxStart")})/12))`);
    row("taxPosition", "Month of the Fiscal Year (Zero Based)", "number", (c) => `IF(${off(c)}<0,0,MOD(${c.cell("count")}-${c.S("s.taxStart")},12))`);
    row("taxRate", "Tax Rate", "number", (c) => `IF(${c.cell("taxYear")}<${years},${pick("rate", "0")(c)},${t(`fiscalYears.${years}.rate`)}*(1+${t("annualRateGrowthPercent")}/100)^(${c.cell("taxYear")}-${years}+1))`);
    row("taxRatePerDollar", "Tax Rate Per Dollar of Assessed Value", "number", (c) => `${c.cell("taxRate")}/IF(${t("rateUnit")}="mills",1000,100)`);
    if (tax.mode === "abatement") row("taxExemption", "Abatement Exemption (Percent)", "percent_number", (c) => `IF(${c.cell("taxYear")}<${years},${pick("exemptionPercent", "0")(c)},0)`);
    if (hasPayment) row("taxPayment", "Stated Payment for the Fiscal Year", "money", (c) => `IF(${c.cell("taxYear")}<${years},${pick("statedPayment", '""')(c)},"")`);
    const exemption = (c: Col) => (tax.mode === "abatement" ? c.cell("taxExemption") : "0");
    const paymentMonth = (c: Col) => alloc(cents(c.cell("taxPayment")), c.cell("taxPosition"));
    if (tax.assessmentBasis === "stated_assessed_value") {
      const assessed = `${cents(t("landAssessedValue"))}+${cents(t("improvementAssessedValue"))}`;
      row("taxAnnualFull", "Whole-Year Tax With No Abatement (Cents)", "number", (c) => `ROUND((${assessed})*${c.cell("taxRatePerDollar")},0)`);
      row("taxAnnualScheduled", "Whole-Year Scheduled Tax (Cents)", "number", (c) => `ROUND((${cents(t("landAssessedValue"))}+${cents(t("improvementAssessedValue"))}*(1-${exemption(c)}/100))*${c.cell("taxRatePerDollar")},0)`);
      row("taxFull", "Tax With No Abatement", "money", (c) => `IF(${off(c)}<0,0,${alloc(c.cell("taxAnnualFull"), c.cell("taxPosition"))}/100)`);
      row("taxScheduled", "Scheduled Tax", "money", (c) => (tax.mode === "full_tax"
        ? c.cell("taxFull")
        : `IF(${off(c)}<0,0,${hasPayment ? `IF(ISNUMBER(${c.cell("taxPayment")}),${paymentMonth(c)}/100,` : "("}${alloc(c.cell("taxAnnualScheduled"), c.cell("taxPosition"))}/100))`));
    } else {
      const capRate = (c: Col) => (tax.leaseUpAssessmentCapRatePercent !== undefined
        ? `IF(${c.cell("stabilized")}=1,${t("assessmentCapRatePercent")},${t("leaseUpAssessmentCapRatePercent")})`
        : t("assessmentCapRatePercent"));
      row("taxableRevenue", "Revenue the Assessor Reads", "money", (c) => (commercial
        ? `${c.cell("residentialEgr")}+${c.cell("commercialRent")}-${c.cell("commercialRentLoss")}`
        : c.cell("residentialEgr")));
      row("taxFull", "Tax With No Abatement", "money", (c) => `IF(${off(c)}<0,0,ROUND(MAX(${cents(c.cell("taxableRevenue"))},0)*(1-${t("assessorExpenseRatioPercent")}/100)/(${capRate(c)}/100)*(${t("assessmentRatioPercent")}/100)*${c.cell("taxRatePerDollar")},0)/100)`);
      row("taxScheduled", "Scheduled Tax", "money", (c) => (tax.mode === "full_tax"
        ? c.cell("taxFull")
        : `IF(${off(c)}<0,0,${hasPayment ? `IF(ISNUMBER(${c.cell("taxPayment")}),${paymentMonth(c)}/100,` : "("}ROUND(${cents(c.cell("taxFull"))}*(1-${exemption(c)}/100),0)/100))`));
    }
  }

  // ------------------------------------------------------------ expense lines
  blank();
  section("Operating Expense Lines");
  expenses.forEach((line, i) => {
    const k = i + 1;
    const amount = n(`operatingExpenseLines.${k}.amount`);
    const lead = optional(`operatingExpenseLines.${k}.leadMonths`, "0");
    const variable = optional(`operatingExpenseLines.${k}.variablePercent`, "0");
    const tagged = isCommercialLine(line);
    if (line.unit !== "percent_effective_gross_revenue") annualLine(`ex.${k}`, line.name, amount, "g.expense", line.unit === "usd_per_unit_year" && !tagged);
    row(`ex.${k}`, line.name, "money", (c) => {
      if (tagged) {
        const active = `${c.cell("count")}>=${c.S("s.firstLease")}-${lead}`;
        return line.unit === "percent_effective_gross_revenue"
          ? `IF(AND(${off(c)}>=0,${active}),${percentOf(c.cell("commercialEffectiveGrossRevenue"), amount)},0)`
          : `IF(AND(${off(c)}>=0,${active}),${annualMonth(c, `ex.${k}`, off(c))}/100,0)`;
      }
      const main = line.unit === "percent_effective_gross_revenue"
        ? percentOf(c.cell("residentialEgr"), amount)
        : `${variableMonth(annualMonth(c, `ex.${k}`, off(c)), variable, c.cell("leaseUpPercent"))}/100`;
      return `IF(${off(c)}<0,IF(${lead}>=-${off(c)},${main},0),${main})`;
    });
  });
  row("residentialExpenses", "Residential Operating Expense Lines", "money", (c) => sum(expenses.flatMap((line, i) => (isCommercialLine(line) ? [] : [c.cell(`ex.${i + 1}`)]))));
  row("taggedExpenses", "Commercial Operating Expense Lines", "money", (c) => sum(expenses.flatMap((line, i) => (isCommercialLine(line) ? [c.cell(`ex.${i + 1}`)] : []))));

  blank();
  section("Capital Expenditure Lines");
  capital.forEach((line, i) => {
    const k = i + 1;
    const amount = n(`capitalExpenditureLines.${k}.amount`);
    const variable = optional(`capitalExpenditureLines.${k}.variablePercent`, "0");
    annualLine(`cx.${k}`, line.name, amount, "g.expense", line.unit === "usd_per_unit_year");
    row(`cx.${k}`, line.name, "money", (c) => `IF(${off(c)}<0,0,${variableMonth(annualMonth(c, `cx.${k}`, off(c)), variable, c.cell("leaseUpPercent"))}/100)`);
  });

  // ----------------------------------------------------------------- assemble
    // Scalars sit first, in their own section, so every sheet reads them from fixed cells.
  const scalarSection: Def[] = [
    { kind: "section", title: "Property" },
    ...scalarDefs.map((d): Scalar => ({ kind: "scalar", key: d.key, label: d.label, format: d.format, engine: d.engine })),
    { kind: "blank" },
  ];
  const all: Def[] = [...scalarSection, ...defs];

  const firstDataRow = HEADING_ROW + 1;
  all.forEach((def, index) => {
    if (def.kind === "scalar" || def.kind === "row") rowNumbers.set(def.key, firstDataRow + index + 1);
  });
  const rowNumber = (key: string) => {
    const found = rowNumbers.get(key);
    if (found === undefined) throw new Error(`The Operations sheet has no row ${key}.`);
    return found;
  };

  const rows: LayoutRow[] = header(source, "Operations");
  rows.push({
    cells: [
      { kind: "text", text: "Line", role: "column" },
      { kind: "text", text: "Total", role: "column" },
      ...months.map(({ month }): LayoutCell => ({ kind: "date", value: `${month}-01` })),
    ],
  });

  const columnFor = (position: number): Col => {
    const letter = columnLetter(FIRST_MONTH_COLUMN + position);
    const previous = position === 0 ? null : columnLetter(FIRST_MONTH_COLUMN + position - 1);
    const first = columnLetter(FIRST_MONTH_COLUMN);
    return {
      position,
      letter,
      first: position === 0,
      date: `${letter}$${HEADING_ROW + 1}`,
      cell: (key) => `${letter}${rowNumber(key)}`,
      prev: (key) => (previous === null ? null : `${previous}${rowNumber(key)}`),
      prevRange: (key) => (previous === null ? null : `$${first}${rowNumber(key)}:${previous}${rowNumber(key)}`),
      toHere: (key) => `$${first}${rowNumber(key)}:${letter}${rowNumber(key)}`,
      S,
    };
  };

  const scalarBuilders = new Map(scalarDefs.map((d) => [d.key, d]));
  for (const def of all) {
    if (def.kind === "section") {
      rows.push({ cells: [{ kind: "text", text: def.title, role: "section" }] });
    } else if (def.kind === "blank") {
      rows.push({ cells: [] });
    } else if (def.kind === "scalar") {
      const built = scalarBuilders.get(def.key)!;
      const formula = built.build(S);
      rows.push({
        outlineLevel: 1,
        cells: [
          { kind: "text", text: def.label, role: "label" },
          built.engine === undefined
            ? { kind: "calc", format: def.format, formula }
            : { kind: "output", id: `ops.${def.key}`, format: def.format, engineValue: built.engine, formula },
        ],
      });
    } else {
      const cells = months.map((month, position): LayoutCell => {
        const formula = def.formula(columnFor(position));
        return def.engine
          ? { kind: "output", id: `ops.${def.key}.${month.month}`, format: def.format, engineValue: def.engine(month), formula }
          : { kind: "calc", format: def.format, formula };
      });
      const rowIndex = rows.length;
      const total: LayoutCell | null = def.total && def.engine
        ? {
          kind: "output",
          id: `ops.${def.key}.total`,
          format: def.format,
          engineValue: operations.totals[def.key as "netOperatingIncome"] ?? months.reduce((acc, month) => acc + def.engine!(month), 0),
          formula: `SUM(${columnLetter(FIRST_MONTH_COLUMN)}${rowIndex + 1}:${columnLetter(FIRST_MONTH_COLUMN + months.length - 1)}${rowIndex + 1})`,
        }
        : null;
      rows.push({ outlineLevel: def.engine ? 1 : 2, cells: [{ kind: "text", text: def.label, role: "label" }, total, ...cells] });
    }
  }

  return {
    sheet: {
      name: SHEET_NAMES.operations,
      columnWidths: [52, 16, ...months.map(() => 13)],
      frozen: { rows: HEADER_ROWS + 1, columns: 2 },
      rows,
    },
    cell: (key, position) => sheetRef(SHEET_NAMES.operations, `${columnLetter(FIRST_MONTH_COLUMN + position)}${rowNumber(key)}`),
    scalar: (key) => sheetRef(SHEET_NAMES.operations, `$B$${rowNumber(key)}`),
    commercialGrowth: (periods) => growthExpression(rates.commercial, periods),
  };
}
