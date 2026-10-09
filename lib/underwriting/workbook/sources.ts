import { earlierSourcesAndUses, type SourcesAndUsesLine } from "@kulka/engine";

import { HEADER_ROWS, SHEET_NAMES, header, type LayoutCell, type LayoutContext, type LayoutRow, type LayoutSheet } from "./frame";

// LA-1949. The sources and uses summary as live formulas, one per line of the engine's
// summary in sourcesAndUsesFor (development-capital.ts). Land and other project cost read
// the Costs sheet; grants and soft loans read their own schedule on the Monthly sheet; the
// funded lines (equity, debt, fees, shortfall, interest) read the Monthly totals.

export type SourcesAndUsesRefs = {
  /** The Costs sheet's project cost total and land total. */
  costs: { total: string; land: string };
  /** The Monthly sheet's Total column for a funding row. */
  monthlyTotal: (key: "equityContribution" | "totalDebtDraw" | "loanFee" | "operatingShortfall" | "capitalizedInterest") => string;
  /** The Monthly sheet's total draws for one grant or soft loan. */
  otherSourceDraws: (sourceId: string) => string;
};

export function buildSourcesAndUsesSheet(ctx: LayoutContext, refs: SourcesAndUsesRefs): LayoutSheet {
  const { source } = ctx;
  const capital = source.result.developmentCapital;
  const summary = capital.sourcesAndUses ?? earlierSourcesAndUses(capital.totals);
  const otherIds = new Set(capital.otherSources?.map(({ id }) => id) ?? []);

  const stepUp = () => `ROUND(${ctx.input("creditedLand.creditedValue")}-${refs.costs.land},2)`;
  const formulaFor = (key: string): string => {
    if (key === "equity") return refs.monthlyTotal("equityContribution");
    if (key === "debt") return refs.monthlyTotal("totalDebtDraw");
    if (key === "land") return refs.costs.land;
    if (key === "otherProjectCosts") return `ROUND(${refs.costs.total}-${refs.costs.land},2)`;
    if (key === "projectCosts") return refs.costs.total;
    if (key === "loanFees") return refs.monthlyTotal("loanFee");
    if (key === "operatingShortfall") return refs.monthlyTotal("operatingShortfall");
    if (key === "capitalizedInterest") return refs.monthlyTotal("capitalizedInterest");
    if (key === "creditedLandEquity" || key === "landStepUp") return stepUp();
    if (key.startsWith("other:") && otherIds.has(key.slice("other:".length))) return refs.otherSourceDraws(key.slice("other:".length));
    throw new Error(`The workbook has no formula for the sources and uses line ${key}.`);
  };

  const rows: LayoutRow[] = header(source, "Sources and Uses");
  const heading = (text: string): LayoutCell => ({ kind: "text", text, role: "column" });
  rows.push({ cells: [heading("Line"), heading("Amount")] });

  const block = (prefix: string, title: string | null, basis: { sources: SourcesAndUsesLine[]; uses: SourcesAndUsesLine[]; totalSources: number; totalUses: number }) => {
    if (title) rows.push({ cells: [{ kind: "text", text: title, role: "section" }] });
    const totals: Record<"Sources" | "Uses", number> = { Sources: 0, Uses: 0 };
    for (const [name, lines, engineTotal] of [["Sources", basis.sources, basis.totalSources], ["Uses", basis.uses, basis.totalUses]] as const) {
      rows.push({ cells: [{ kind: "text", text: name, role: "section" }] });
      const firstRow = rows.length + 1;
      for (const line of lines) {
        rows.push({
          outlineLevel: 1,
          cells: [
            { kind: "text", text: line.label, role: "label" },
            { kind: "output", id: `${prefix}.${name.toLowerCase()}.${line.key}`, format: "money", engineValue: line.amount, formula: formulaFor(line.key) },
          ],
        });
      }
      const lastRow = rows.length;
      totals[name] = rows.length + 1;
      rows.push({
        cells: [
          { kind: "text", text: `Total ${name}`, role: "label" },
          { kind: "output", id: `${prefix}.total.${name.toLowerCase()}`, format: "money", engineValue: engineTotal, formula: `SUM(B${firstRow}:B${lastRow})` },
        ],
      });
      rows.push({ cells: [] });
    }
    rows.push({
      cells: [
        { kind: "text", text: "Sources Less Uses", role: "label" },
        { kind: "output", id: `${prefix}.difference`, format: "money", engineValue: 0, formula: `ROUND(B${totals.Sources}-B${totals.Uses},2)` },
      ],
    });
  };

  block("su.cash", null, summary.cashBasis);
  if (summary.creditedBasis) {
    rows.push({ cells: [] });
    block("su.credited", "With Land at Credited Value (Non-Cash)", summary.creditedBasis);
  }
  return { name: SHEET_NAMES.sourcesAndUses, columnWidths: [56, 20], frozen: { rows: HEADER_ROWS + 1, columns: 1 }, rows };
}
