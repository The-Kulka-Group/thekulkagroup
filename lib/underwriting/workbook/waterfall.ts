import type { PartnershipMetricKey, PartnershipMonth, PartnershipPlan, PartnershipResult } from "@kulka/engine";

import {
  HEADER_ROWS,
  SHEET_NAMES,
  columnLetter,
  dateOfMonthText,
  header,
  monthCount,
  sheetRef,
  xirrFromFirstFlow,
  type CellFormat,
  type LayoutCell,
  type LayoutContext,
  type LayoutRow,
  type LayoutSheet,
} from "./frame";

// LA-1952. The LP and GP waterfall as live formulas, following partnership-waterfall.ts line for line.
// Each month is a column. Money works in whole cents where the engine does, so every rounding lands on
// the same cent: funding by the funding order and the LP catch-up, the preferred return and return of
// capital paid pro rata, each IRR hurdle tier against its LP hurdle account, then the final split.

const FIRST_MONTH_COLUMN = 2;
const HEADING_ROW = HEADER_ROWS;

/** Where the waterfall reads each month's levered cash flow and the capital plan's equity contribution, in dollars. */
export type WaterfallFeed = {
  /** The months in order, as YYYY-MM. */
  months: string[];
  levered: (position: number) => string;
  equity: (position: number) => string;
};

export type WaterfallBuild = {
  sheet: LayoutSheet;
  /** A partnership metric on this sheet, absolute, for the Returns sheet to show. */
  metric: (key: PartnershipMetricKey) => string;
};

type Col = {
  first: boolean;
  date: string;
  cell: (key: string) => string;
  prev: (key: string) => string;
};

type Def =
  | { kind: "section"; title: string }
  | { kind: "blank" }
  | { kind: "scalar"; key: string; label: string; format: CellFormat; formula: (S: (key: string) => string) => string; engine?: number | null }
  | { kind: "row"; key: string; label: string; format: CellFormat; formula: (c: Col) => string; engine?: (month: PartnershipMonth) => number };

export function buildWaterfallSheet(ctx: LayoutContext, plan: PartnershipPlan, result: PartnershipResult, feed: WaterfallFeed): WaterfallBuild {
  const p = (path: string) => ctx.input(`partnership.${path}`);
  const defs: Def[] = [];
  const section = (title: string) => defs.push({ kind: "section", title });
  const blank = () => defs.push({ kind: "blank" });
  const scalar = (key: string, label: string, format: CellFormat, formula: (S: (key: string) => string) => string, engine?: number | null) =>
    defs.push({ kind: "scalar", key, label, format, formula, engine });
  /** A working row in cents. */
  const work = (key: string, label: string, formula: (c: Col) => string) => defs.push({ kind: "row", key, label, format: "number", formula });
  /** An output row in dollars, read from a working row in cents. */
  const out = (key: string, label: string, centsKey: string, engine: (month: PartnershipMonth) => number) =>
    defs.push({ kind: "row", key, label, format: "money", formula: (c) => `${c.cell(centsKey)}/100`, engine });
  const prior = (c: Col, key: string) => (c.first ? "0" : c.prev(key));
  /** payProRata in partnership-waterfall.ts: up to `available`, split in proportion to two balances, never past either. */
  const proRata = (available: string, lp: string, gp: string) => {
    const owed = `(${lp}+${gp})`;
    const none = `OR(${owed}<=0,${available}<=0)`;
    return {
      lp: `IF(${none},0,MIN(ROUND(MIN(${available},${owed})*${lp}/${owed},0),${lp}))`,
      gp: (lpPaid: string) => `IF(${none},0,MIN(MIN(${available},${owed})-${lpPaid},${gp}))`,
    };
  };

  const pref = plan.preferredReturn;
  const tiers = plan.tiers;
  const metric = (key: PartnershipMetricKey) => result.metrics.find((entry) => entry.key === key)?.value;

  // ------------------------------------------------------------------ terms
  section("Terms");
  scalar("s.share", "LP Funding Share", "rate", () => `${p("lpFundingSharePercent")}/100`);
  scalar("s.pari", "Pari Passu Funding (1 = Yes)", "number", () => `IF(${p("fundingOrder")}="pari_passu",1,0)`);
  scalar("s.entry", "LP Entry Month (Month Count)", "number", () =>
    (plan.lpEntryMonth === undefined ? monthCount(`${columnLetter(FIRST_MONTH_COLUMN)}$${HEADING_ROW + 1}`) : monthCount(dateOfMonthText(p("lpEntryMonth")))));
  scalar("s.totalContribution", "Partner Contributions (Cents)", "number", () => `SUM(${rowRange("contribution")})`);
  scalar("s.gpTarget", "GP Share of Contributions Under GP First (Cents)", "number", (S) => `${S("s.totalContribution")}-ROUND(${S("s.totalContribution")}*${S("s.share")},0)`);
  if (pref) {
    const compound = `${p("preferredReturn.accrual")}="compound_monthly"`;
    scalar("s.compound", "Preferred Return Compounds (1 = Yes)", "number", () => `IF(${compound},1,0)`);
    scalar("s.prefRate", "Preferred Return Monthly Rate", "number", () =>
      `IF(${compound},(1+${p("preferredReturn.ratePercent")}/100)^(1/12)-1,${p("preferredReturn.ratePercent")}/100/12)`);
  }
  tiers.forEach((_, index) => {
    const t = index + 1;
    scalar(`s.tierRate.${t}`, `Tier ${t}: Monthly Hurdle Rate`, "number", () => `(1+${p(`tiers.${t}.lpIrrHurdlePercent`)}/100)^(1/12)-1`);
    scalar(`s.tierShare.${t}`, `Tier ${t}: LP Share After the Promote`, "number", () => `${p(`tiers.${t}.lpBaseSharePercent`)}/100*(1-${p(`tiers.${t}.promotePercent`)}/100)`);
  });
  scalar("s.finalShare", "Final Split: LP Share After the Promote", "number", () => `${p("finalSplit.lpBaseSharePercent")}/100*(1-${p("finalSplit.promotePercent")}/100)`);

  // ------------------------------------------------------------- returns
  blank();
  section("Partner Returns");
  const T = (key: string) => totalCell(key);
  const usd = (key: PartnershipMetricKey, label: string, formula: () => string) => scalar(`m.${key}`, label, "money", formula, metric(key));
  usd("lpContributions", "LP Contributions", () => T("lpContribution"));
  usd("gpContributions", "GP Contributions", () => T("gpContribution"));
  usd("lpDistributions", "LP Distributions", () => T("lpDistribution"));
  usd("gpDistributions", "GP Distributions", () => T("gpDistribution"));
  usd("lpNetProfit", "LP Net Profit", () => `${T("lpDistribution")}-${T("lpContribution")}`);
  usd("gpNetProfit", "GP Net Profit", () => `${T("gpDistribution")}-${T("gpContribution")}`);
  scalar("m.lpXirr", "LP XIRR", "rate", () => xirrFromFirstFlow(rowRange("lpNetCashFlow"), rowRange("cashFlowDate")), metric("lpXirr"));
  scalar("m.gpXirr", "GP XIRR", "rate", () => xirrFromFirstFlow(rowRange("gpNetCashFlow"), rowRange("cashFlowDate")), metric("gpXirr"));
  scalar("m.lpEquityMultiple", "LP Equity Multiple", "multiple", () => `${T("lpDistribution")}/${T("lpContribution")}`, metric("lpEquityMultiple"));
  scalar("m.gpEquityMultiple", "GP Equity Multiple", "multiple", () => `${T("gpDistribution")}/${T("gpContribution")}`, metric("gpEquityMultiple"));
  usd("lpPeakEquity", "LP Peak Equity", () => `MAX(0,MAX(${rowRange("lpOut")}))/100`);
  usd("gpPeakEquity", "GP Peak Equity", () => `MAX(0,MAX(${rowRange("gpOut")}))/100`);
  if (pref) {
    usd("lpPreferredReturnAccrued", "LP Preferred Return Accrued", () => T("lpPreferredReturnAccrued"));
    usd("gpPreferredReturnAccrued", "GP Preferred Return Accrued", () => T("gpPreferredReturnAccrued"));
  }
  usd("promoteTotal", "GP Promote", () => [...tiers.map((_, index) => T(`tier.${index + 1}.promote`)), T("final.promote")].join("+"));
  usd("cashCalls", "Cash Calls", () => T("cashCall"));

  // --------------------------------------------------------------- funding
  blank();
  section("Funding (Cents Unless Marked)");
  defs.push({ kind: "row", key: "cashFlowDate", label: "Cash Flow Date, Month End", format: "date", formula: (c) => `EOMONTH(${c.date},0)` });
  work("levered", "Levered Cash Flow", (c) => `ROUND(${c.cell("leveredIn")}*100,0)`);
  work("equity", "Capital Plan Equity Contribution", (c) => `ROUND(${c.cell("equityIn")}*100,0)`);
  work("cashCallCents", "Cash Call", (c) => `MAX(-(${c.cell("levered")}+${c.cell("equity")}),0)`);
  work("contribution", "Partner Contributions", (c) => `${c.cell("equity")}+${c.cell("cashCallCents")}`);
  work("distributableCents", "Distributable Cash", (c) => `${c.cell("levered")}+${c.cell("contribution")}`);
  work("lpIn", "LP Has Closed (1 = Yes)", (c) => `IF(${monthCount(c.date)}>=${S("s.entry")},1,0)`);
  work("fundedBefore", "Contributions Before This Month", (c) => (c.first ? "0" : `${c.prev("fundedBefore")}+${c.prev("contribution")}`));
  work("gpFundedBefore", "GP Contributions Before This Month", (c) => (c.first ? "0" : `${c.prev("gpFundedBefore")}+${c.prev("gpContributionCents")}`));
  work("catchUp", "LP Catch-Up Paid to the GP", (c) => (c.first
    ? "0"
    : `IF(${monthCount(c.date)}=${S("s.entry")},IF(${S("s.pari")}=1,ROUND(${c.cell("fundedBefore")}*${S("s.share")},0),MAX(${c.cell("gpFundedBefore")}-${S("s.gpTarget")},0)),0)`));
  work("gpRegular", "GP Share of This Month's Contributions", (c) =>
    `IF(${S("s.pari")}=1,${c.cell("contribution")}-ROUND(${c.cell("contribution")}*${S("s.share")},0),MIN(MAX(${S("s.gpTarget")}-(${c.cell("gpFundedBefore")}-${c.cell("catchUp")}),0),${c.cell("contribution")}))`);
  work("lpContributionCents", "LP Contribution", (c) => `IF(${c.cell("lpIn")}=1,${c.cell("contribution")}-${c.cell("gpRegular")}+${c.cell("catchUp")},0)`);
  work("gpContributionCents", "GP Contribution", (c) => `IF(${c.cell("lpIn")}=1,${c.cell("gpRegular")}-${c.cell("catchUp")},${c.cell("contribution")})`);
  out("cashCall", "Cash Call (Dollars)", "cashCallCents", (m) => m.cashCall);
  out("distributable", "Distributable Cash (Dollars)", "distributableCents", (m) => m.distributable);
  out("lpContribution", "LP Contribution (Dollars)", "lpContributionCents", (m) => m.lpContribution);
  out("gpContribution", "GP Contribution (Dollars)", "gpContributionCents", (m) => m.gpContribution);
  out("lpCatchUp", "LP Catch-Up (Dollars)", "catchUp", (m) => m.lpCatchUp);

  // -------------------------------------------- preferred return and capital
  let cashAfterPref: (c: Col) => string = (c) => c.cell("distributableCents");
  let lpPaidAfterPref: (c: Col) => string = () => "0";
  if (pref) {
    blank();
    section("Preferred Return, Then Return of Capital (Cents Unless Marked)");
    for (const who of ["lp", "gp"] as const) {
      const W = who.toUpperCase();
      work(`${who}CapitalOpen`, `${W} Unreturned Capital, Opening`, (c) => prior(c, `${who}CapitalClose`));
      work(`${who}PrefOpen`, `${W} Unpaid Preferred Return, Opening`, (c) => prior(c, `${who}PrefClose`));
      work(`${who}PrefAccrued`, `${W} Preferred Return Accrued`, (c) =>
        `ROUND((${c.cell(`${who}CapitalOpen`)}+IF(${S("s.compound")}=1,${c.cell(`${who}PrefOpen`)},0))*${S("s.prefRate")},0)`);
      work(`${who}PrefOwed`, `${W} Preferred Return Owed`, (c) => `${c.cell(`${who}PrefOpen`)}+${c.cell(`${who}PrefAccrued`)}`);
      work(`${who}CapitalOwed`, `${W} Capital Owed`, (c) => `${c.cell(`${who}CapitalOpen`)}+${c.cell(`${who}ContributionCents`)}`);
    }
    const prefPaid = (c: Col) => proRata(c.cell("distributableCents"), c.cell("lpPrefOwed"), c.cell("gpPrefOwed"));
    work("lpPrefPaid", "LP Preferred Return Paid", (c) => prefPaid(c).lp);
    work("gpPrefPaid", "GP Preferred Return Paid", (c) => prefPaid(c).gp(c.cell("lpPrefPaid")));
    work("cashAfterPrefPaid", "Cash Left After the Preferred Return", (c) => `${c.cell("distributableCents")}-${c.cell("lpPrefPaid")}-${c.cell("gpPrefPaid")}`);
    const capital = (c: Col) => proRata(c.cell("cashAfterPrefPaid"), c.cell("lpCapitalOwed"), c.cell("gpCapitalOwed"));
    work("lpCapitalReturnedCents", "LP Capital Returned", (c) => capital(c).lp);
    work("gpCapitalReturnedCents", "GP Capital Returned", (c) => capital(c).gp(c.cell("lpCapitalReturnedCents")));
    for (const who of ["lp", "gp"] as const) {
      const W = who.toUpperCase();
      work(`${who}CapitalClose`, `${W} Unreturned Capital, Closing`, (c) => `${c.cell(`${who}CapitalOwed`)}-${c.cell(`${who}CapitalReturnedCents`)}`);
      work(`${who}PrefClose`, `${W} Unpaid Preferred Return, Closing`, (c) => `${c.cell(`${who}PrefOwed`)}-${c.cell(`${who}PrefPaid`)}`);
    }
    work("cashAfterCapital", "Cash Left After Return of Capital", (c) => `${c.cell("cashAfterPrefPaid")}-${c.cell("lpCapitalReturnedCents")}-${c.cell("gpCapitalReturnedCents")}`);
    out("lpPreferredReturnAccrued", "LP Preferred Return Accrued (Dollars)", "lpPrefAccrued", (m) => m.lpPreferredReturnAccrued);
    out("gpPreferredReturnAccrued", "GP Preferred Return Accrued (Dollars)", "gpPrefAccrued", (m) => m.gpPreferredReturnAccrued);
    out("lpPreferredReturnPaid", "LP Preferred Return Paid (Dollars)", "lpPrefPaid", (m) => m.lpPreferredReturnPaid);
    out("gpPreferredReturnPaid", "GP Preferred Return Paid (Dollars)", "gpPrefPaid", (m) => m.gpPreferredReturnPaid);
    out("lpCapitalReturned", "LP Capital Returned (Dollars)", "lpCapitalReturnedCents", (m) => m.lpCapitalReturned);
    out("gpCapitalReturned", "GP Capital Returned (Dollars)", "gpCapitalReturnedCents", (m) => m.gpCapitalReturned);
    cashAfterPref = (c) => c.cell("cashAfterCapital");
    lpPaidAfterPref = (c) => `${c.cell("lpPrefPaid")}+${c.cell("lpCapitalReturnedCents")}`;
  }

  // ------------------------------------------------------------------ tiers
  tiers.forEach((_, index) => {
    const t = index + 1;
    const k = (name: string) => `tier.${t}.${name}`;
    blank();
    section(`Tier ${t}: To the LP IRR Hurdle (Cents Unless Marked)`);
    work(k("hurdleOpen"), "LP Hurdle Account, Opening", (c) => prior(c, k("hurdleClose")));
    work(k("hurdle"), "LP Hurdle Account After Accrual and This Month's LP Contribution", (c) =>
      `${c.cell(k("hurdleOpen"))}+ROUND(${c.cell(k("hurdleOpen"))}*${S(`s.tierRate.${t}`)},0)+${c.cell("lpContributionCents")}`);
    work(k("cashIn"), "Cash Reaching the Tier", (c) => (t === 1 ? cashAfterPref(c) : c.cell(`tier.${t - 1}.cashLeft`)));
    work(k("lpPaidBefore"), "LP Paid Before the Tier", (c) => (t === 1 ? lpPaidAfterPref(c) : `${c.cell(`tier.${t - 1}.lpPaidBefore`)}+${c.cell(`tier.${t - 1}.lpCents`)}`));
    work(k("lpShareCash"), "LP Share of the Cash Reaching the Tier", (c) => `ROUND(${c.cell(k("cashIn"))}*${S(`s.tierShare.${t}`)},0)`);
    work(k("lpCents"), "LP Cash in the Tier", (c) => `MIN(${c.cell(k("lpShareCash"))},MAX(${c.cell(k("hurdle"))}-${c.cell(k("lpPaidBefore"))},0))`);
    work(k("totalCents"), "Cash the Tier Takes", (c) =>
      `IF(${c.cell(k("lpCents"))}=${c.cell(k("lpShareCash"))},${c.cell(k("cashIn"))},MIN(${c.cell(k("cashIn"))},ROUND(${c.cell(k("lpCents"))}/${S(`s.tierShare.${t}`)},0)))`);
    work(k("promoteCents"), "GP Promote in the Tier", (c) =>
      `MIN(ROUND(${c.cell(k("totalCents"))}*${p(`tiers.${t}.promotePercent`)}/100,0),${c.cell(k("totalCents"))}-${c.cell(k("lpCents"))})`);
    work(k("gpBaseCents"), "GP Base Share in the Tier", (c) => `${c.cell(k("totalCents"))}-${c.cell(k("lpCents"))}-${c.cell(k("promoteCents"))}`);
    work(k("cashLeft"), "Cash Left After the Tier", (c) => `${c.cell(k("cashIn"))}-${c.cell(k("totalCents"))}`);
    work(k("hurdleClose"), "LP Hurdle Account, Closing", (c) => `${c.cell(k("hurdle"))}-${c.cell("lpDistributionCents")}`);
    out(k("lp"), "LP (Dollars)", k("lpCents"), (m) => m.tiers[index].lp);
    out(k("gpBase"), "GP Base Share (Dollars)", k("gpBaseCents"), (m) => m.tiers[index].gpBase);
    out(k("promote"), "GP Promote (Dollars)", k("promoteCents"), (m) => m.tiers[index].promote);
    out(k("total"), "Tier Total (Dollars)", k("totalCents"), (m) => m.tiers[index].total);
  });

  // ------------------------------------------------------------ final split
  blank();
  section("Final Split (Cents Unless Marked)");
  const last = tiers.length;
  work("final.cash", "Cash Reaching the Final Split", (c) => (last === 0 ? cashAfterPref(c) : c.cell(`tier.${last}.cashLeft`)));
  work("final.lpCents", "LP Share", (c) => `ROUND(${c.cell("final.cash")}*${S("s.finalShare")},0)`);
  work("final.promoteCents", "GP Promote", (c) => `MIN(ROUND(${c.cell("final.cash")}*${p("finalSplit.promotePercent")}/100,0),${c.cell("final.cash")}-${c.cell("final.lpCents")})`);
  work("final.gpBaseCents", "GP Base Share", (c) => `${c.cell("final.cash")}-${c.cell("final.lpCents")}-${c.cell("final.promoteCents")}`);
  out("final.lp", "LP (Dollars)", "final.lpCents", (m) => m.finalSplit.lp);
  out("final.gpBase", "GP Base Share (Dollars)", "final.gpBaseCents", (m) => m.finalSplit.gpBase);
  out("final.promote", "GP Promote (Dollars)", "final.promoteCents", (m) => m.finalSplit.promote);
  out("final.total", "Final Split Total (Dollars)", "final.cash", (m) => m.finalSplit.total);

  // ---------------------------------------------------------- distributions
  blank();
  section("Distributions (Cents Unless Marked)");
  work("lpDistributionCents", "LP Distribution", (c) =>
    `${last === 0 ? lpPaidAfterPref(c) : `${c.cell(`tier.${last}.lpPaidBefore`)}+${c.cell(`tier.${last}.lpCents`)}`}+${c.cell("final.lpCents")}`);
  work("gpDistributionCents", "GP Distribution", (c) => `${c.cell("distributableCents")}-${c.cell("lpDistributionCents")}`);
  work("lpNetCents", "LP Net Cash Flow", (c) => `${c.cell("lpDistributionCents")}-${c.cell("lpContributionCents")}`);
  work("gpNetCents", "GP Net Cash Flow", (c) => `${c.cell("gpDistributionCents")}-${c.cell("gpContributionCents")}`);
  work("lpOut", "LP Equity Out, Running", (c) => `${prior(c, "lpOut")}-${c.cell("lpNetCents")}`);
  work("gpOut", "GP Equity Out, Running", (c) => `${prior(c, "gpOut")}-${c.cell("gpNetCents")}`);
  out("lpDistribution", "LP Distribution (Dollars)", "lpDistributionCents", (m) => m.lpDistribution);
  out("gpDistribution", "GP Distribution (Dollars)", "gpDistributionCents", (m) => m.gpDistribution);
  out("lpNetCashFlow", "LP Net Cash Flow (Dollars)", "lpNetCents", (m) => m.lpNetCashFlow);
  out("gpNetCashFlow", "GP Net Cash Flow (Dollars)", "gpNetCents", (m) => m.gpNetCashFlow);

  // The feed sits at the end: two rows that read the property cash flow, or the replay's inputs.
  blank();
  section("From the Property Cash Flow (Dollars)");
  defs.push({ kind: "row", key: "leveredIn", label: "Levered Cash Flow", format: "money", formula: (c) => feed.levered(position(c)) });
  defs.push({ kind: "row", key: "equityIn", label: "Equity Contribution", format: "money", formula: (c) => feed.equity(position(c)) });

  // ------------------------------------------------------------- numbering
  const rowNumbers = new Map<string, number>();
  defs.forEach((def, index) => {
    if (def.kind === "scalar" || def.kind === "row") rowNumbers.set(def.key, HEADING_ROW + 2 + index);
  });
  function rowNumber(key: string) {
    const row = rowNumbers.get(key);
    if (row === undefined) throw new Error(`The Waterfall sheet has no row ${key}.`);
    return row;
  }
  function S(key: string) {
    return `$B$${rowNumber(key)}`;
  }
  function totalCell(key: string) {
    return `$B$${rowNumber(key)}`;
  }
  function rowRange(key: string) {
    return `$${columnLetter(FIRST_MONTH_COLUMN)}$${rowNumber(key)}:$${columnLetter(FIRST_MONTH_COLUMN + feed.months.length - 1)}$${rowNumber(key)}`;
  }
  const columns = feed.months.map((_, index): Col & { position: number } => {
    const letter = columnLetter(FIRST_MONTH_COLUMN + index);
    const previous = columnLetter(FIRST_MONTH_COLUMN + index - 1);
    return {
      position: index,
      first: index === 0,
      date: `${letter}$${HEADING_ROW + 1}`,
      cell: (key) => `${letter}${rowNumber(key)}`,
      prev: (key) => `${previous}${rowNumber(key)}`,
    };
  });
  function position(c: Col) {
    return (c as Col & { position: number }).position;
  }

  const rows: LayoutRow[] = header(ctx.source, "LP and GP Waterfall");
  rows.push({
    cells: [
      { kind: "text", text: "Line", role: "column" },
      { kind: "text", text: "Total or Value", role: "column" },
      ...feed.months.map((month): LayoutCell => ({ kind: "date", value: `${month}-01` })),
    ],
  });
  for (const def of defs) {
    if (def.kind === "section") {
      rows.push({ cells: [{ kind: "text", text: def.title, role: "section" }] });
    } else if (def.kind === "blank") {
      rows.push({ cells: [] });
    } else if (def.kind === "scalar") {
      const formula = def.formula(S);
      // A metric the engine could not report (an XIRR with no root, a GP with no equity) stays a working cell.
      const cell: LayoutCell = def.engine === undefined || def.engine === null
        ? { kind: "calc", format: def.format, formula }
        : { kind: "output", id: `waterfall.${def.key}`, format: def.format, engineValue: def.engine, formula };
      rows.push({ outlineLevel: 1, cells: [{ kind: "text", text: def.label, role: "label" }, cell] });
    } else {
      const rowIndex = rows.length;
      const engine = def.engine;
      const cells = columns.map((column, index): LayoutCell => {
        const formula = def.formula(column);
        return engine
          ? { kind: "output", id: `waterfall.${def.key}.${feed.months[index]}`, format: def.format, engineValue: engine(result.months[index]), formula }
          : { kind: "calc", format: def.format, formula };
      });
      const total: LayoutCell | null = engine
        ? {
          kind: "output",
          id: `waterfall.${def.key}.total`,
          format: def.format,
          engineValue: result.months.reduce((sum, month) => sum + Math.round(engine(month) * 100), 0) / 100,
          formula: `SUM(${columnLetter(FIRST_MONTH_COLUMN)}${rowIndex + 1}:${columnLetter(FIRST_MONTH_COLUMN + feed.months.length - 1)}${rowIndex + 1})`,
        }
        : null;
      rows.push({ outlineLevel: engine ? 1 : 2, cells: [{ kind: "text", text: def.label, role: "label" }, total, ...cells] });
    }
  }

  return {
    sheet: {
      name: SHEET_NAMES.waterfall,
      columnWidths: [60, 18, ...feed.months.map(() => 13)],
      frozen: { rows: HEADER_ROWS + 1, columns: 2 },
      rows,
    },
    metric: (key) => sheetRef(SHEET_NAMES.waterfall, S(`m.${key}`)),
  };
}
