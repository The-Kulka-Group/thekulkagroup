import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { APARTMENT_OPERATIONS_ASSUMPTION_KEYS, DEVELOPMENT_CAPITAL_ASSUMPTION_KEYS, type CommercialOperations, type OtherFundingSource, type PermanentLoanPlan, type PropertyTaxPlan } from "@kulka/engine";

import type { UnderwritingCase } from "@/lib/underwriting/cases";
import { ApartmentOperationsEditor } from "./ApartmentOperationsEditor";
import { CommercialSection } from "./CommercialSection";
import { DevelopmentCapitalEditor } from "./DevelopmentCapitalEditor";
import { OtherSourcesSection } from "./OtherSourcesSection";
import { PermanentLoanSection } from "./PermanentLoanSection";
import { PropertyTaxSection } from "./PropertyTaxSection";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const common = { sourceLabel: "Intake Memo", sourceDate: "2026-10-01" };
const stamp = { ...common, reviewState: "working" };
const none = {};
const working = { reviewState: "working" as const };

type Props = Record<string, unknown> & { children?: ReactNode; onClick?: () => void; onChange?: (event: unknown) => void };

/** The sections hold no hooks, so calling one returns its element tree and the handlers can be run directly. */
function find(node: ReactNode, match: (element: ReactElement<Props>) => boolean): ReactElement<Props> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, match);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement<Props>(node)) return undefined;
  return match(node) ? node : find(node.props.children, match);
}

function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return isValidElement<Props>(node) ? text(node.props.children) : "";
}

const button = (tree: ReactNode, label: string) => find(tree, (element) => element.type === "button" && text(element.props.children) === label)!;
const checkbox = (tree: ReactNode, id?: string) => find(tree, (element) => element.type === "input" && element.props.type === "checkbox" && (id === undefined || element.props.id === id))!;
const check = (tree: ReactNode, id?: string) => checkbox(tree, id).props.onChange!({ target: { checked: true } });

const emptyBlock: CommercialOperations = { spaces: [], vacancyPercent: 0, creditLossPercent: 0, reviewState: "working" };

describe("common source on new lines and evidence rows (LA-2081)", () => {
  describe("commercial", () => {
    const render = (commonSource: object, commercial?: CommercialOperations) => {
      const set = vi.fn();
      const tree = CommercialSection({ commercial, setCommercial: set, expenseLines: [], hasPropertyTax: false, milestones: [], defaultMonth: "2027-01", source: commonSource, fieldErrors: {} });
      return { tree, set };
    };

    it("starts the block and its first space with the common source", () => {
      const { tree, set } = render(common);
      check(tree, "commercial-use");
      const created = set.mock.calls[0][0] as CommercialOperations;
      expect(created).toMatchObject(stamp);
      expect(created.spaces[0]).toMatchObject(stamp);
    });

    it("starts each added space with the common source and leaves saved spaces alone", () => {
      const saved = { id: "a", name: "A", areaSf: 1, annualRentPerSf: 1, freeRentMonths: 0, recoveries: [], tenantImprovementPerSf: 0, leasingCommissionPercent: 0, leaseTermMonths: 60, sourceLabel: "Broker", reviewState: "done" as const };
      const { tree, set } = render(common, { ...emptyBlock, spaces: [saved] });
      button(tree, "Add Commercial Space").props.onClick!();
      const spaces = (set.mock.calls[0][0] as CommercialOperations).spaces;
      expect(spaces[0]).toEqual(saved);
      expect(spaces[1]).toMatchObject(stamp);
    });

    it("adds no source when the case has none", () => {
      const { tree, set } = render(none);
      check(tree, "commercial-use");
      const created = set.mock.calls[0][0] as CommercialOperations;
      expect(created.sourceLabel).toBeUndefined();
      expect(created.spaces[0].sourceDate).toBeUndefined();
    });
  });

  describe("other sources", () => {
    const render = (commonSource: object, sources: OtherFundingSource[] = []) => {
      const setSources = vi.fn();
      const setCreditedLand = vi.fn();
      const tree = OtherSourcesSection({ sources, setSources, setCreditedLand, defaultMonth: "2027-01", source: commonSource, fieldErrors: {} });
      return { tree, setSources, setCreditedLand };
    };

    it("starts a grant, a soft loan and credited land with the common source", () => {
      const { tree, setSources, setCreditedLand } = render(common);
      button(tree, "Add Grant").props.onClick!();
      button(tree, "Add Soft Loan").props.onClick!();
      check(tree, "credited-land-use");
      expect(setSources.mock.calls[0][0][0]).toMatchObject(stamp);
      expect(setSources.mock.calls[1][0][0]).toMatchObject({ ...stamp, kind: "soft_loan" });
      expect(setCreditedLand.mock.calls[0][0]).toMatchObject(stamp);
    });

    it("keeps a saved funding source as it is when a new one is added", () => {
      const saved: OtherFundingSource = { id: "source-1", name: "City", kind: "grant", draws: [{ month: "2027-01", amount: 1 }], sourceLabel: "Award Letter", ...working };
      const { tree, setSources } = render(common, [saved]);
      button(tree, "Add Grant").props.onClick!();
      const next = setSources.mock.calls[0][0] as OtherFundingSource[];
      expect(next[0]).toEqual(saved);
      expect(next[1]).toMatchObject(stamp);
    });

    it("adds no source when the case has none", () => {
      const { tree, setSources } = render(none);
      button(tree, "Add Grant").props.onClick!();
      expect(setSources.mock.calls[0][0][0].sourceLabel).toBeUndefined();
    });
  });

  describe("permanent loan", () => {
    const render = (commonSource: object) => {
      const set = vi.fn();
      const tree = PermanentLoanSection({ setPermanentLoan: set, milestones: [], defaultMonth: "2028-01", source: commonSource, fieldErrors: {} });
      return { tree, set };
    };

    it("starts every term evidence row with the common source", () => {
      const { tree, set } = render(common);
      check(tree, "permanent-loan-use");
      const rows = Object.values((set.mock.calls[0][0] as PermanentLoanPlan).evidence);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row).toMatchObject(stamp);
    });

    it("adds no source when the case has none", () => {
      const { tree, set } = render(none);
      check(tree, "permanent-loan-use");
      for (const row of Object.values((set.mock.calls[0][0] as PermanentLoanPlan).evidence)) expect(row).toEqual(working);
    });
  });

  describe("property tax", () => {
    const render = (commonSource: object) => {
      const set = vi.fn();
      const tree = PropertyTaxSection({ setPlan: set, source: commonSource, fieldErrors: {} });
      return { tree, set };
    };

    it("starts every tax evidence row with the common source", () => {
      const { tree, set } = render(common);
      check(tree);
      const rows = Object.values((set.mock.calls[0][0] as PropertyTaxPlan).taxEvidence);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row).toMatchObject(stamp);
    });

    it("adds no source when the case has none", () => {
      const { tree, set } = render(none);
      check(tree);
      for (const row of Object.values((set.mock.calls[0][0] as PropertyTaxPlan).taxEvidence)) expect(row).toEqual(working);
    });
  });
});

describe("common source on assumption source rows (LA-2082)", () => {
  const assumption = (name: string, source: object) => ({ name, value: 1, unit: "usd", reviewState: "working", ...source });
  const costSchedule = { analysisStartMonth: "2027-01", saleMonth: "2029-01", milestones: [], costLines: [] };
  const intake = (source: object) => ({
    id: "case-1",
    caseRevision: 1,
    assumptions: [assumption("purchasePrice", source), assumption("monthlyRent", source)],
    factMetadata: {},
    costSchedule,
  });

  /** The source label and source date inputs inside the assumption source table, in row order. */
  const evidenceInputs = (html: string) => {
    const table = /<table[^>]*underwriting-assumption-evidence[^>]*>[\s\S]*?<\/table>/.exec(html)![0];
    const inputs = [...table.matchAll(/<input[^>]*>/g)].map((match) => match[0]);
    return {
      labels: inputs.filter((input) => /aria-label="[^"]* source label"/.test(input)),
      dates: inputs.filter((input) => /aria-label="[^"]* source date"/.test(input)),
    };
  };

  const operations = (savedCase: object) => evidenceInputs(renderToStaticMarkup(<ApartmentOperationsEditor savedCase={savedCase as UnderwritingCase} />));
  const capital = (savedCase: object) => evidenceInputs(renderToStaticMarkup(<DevelopmentCapitalEditor savedCase={{ apartmentOperations: {}, ...savedCase } as UnderwritingCase} />));

  describe("apartment operations", () => {
    it("opens every source row with the common source while the section is unsaved", () => {
      const { labels, dates } = operations(intake(common));
      expect(labels).toHaveLength(APARTMENT_OPERATIONS_ASSUMPTION_KEYS.length);
      expect(dates).toHaveLength(APARTMENT_OPERATIONS_ASSUMPTION_KEYS.length);
      for (const input of labels) expect(input).toContain('value="Intake Memo"');
      for (const input of dates) expect(input).toContain('value="2026-10-01"');
    });

    it("leaves the rows blank when the case has no common source", () => {
      const { labels, dates } = operations(intake(none));
      for (const input of [...labels, ...dates]) expect(input).toContain('value=""');
    });

    it("leaves a saved section as saved", () => {
      const evidence = Object.fromEntries(APARTMENT_OPERATIONS_ASSUMPTION_KEYS.map((key) => [key, { sourceLabel: "Broker", reviewState: "done" }]));
      const { labels, dates } = operations({ ...intake(common), apartmentOperations: { assumptionEvidence: evidence, residentialUnitTypes: [], otherIncomeLines: [], operatingExpenseLines: [], capitalExpenditureLines: [] } });
      for (const input of labels) expect(input).toContain('value="Broker"');
      for (const input of dates) expect(input).toContain('value=""');
    });
  });

  describe("development capital", () => {
    it("opens every source row with the common source while the section is unsaved", () => {
      const { labels, dates } = capital(intake(common));
      expect(labels).toHaveLength(DEVELOPMENT_CAPITAL_ASSUMPTION_KEYS.length);
      expect(dates).toHaveLength(DEVELOPMENT_CAPITAL_ASSUMPTION_KEYS.length);
      for (const input of labels) expect(input).toContain('value="Intake Memo"');
      for (const input of dates) expect(input).toContain('value="2026-10-01"');
    });

    it("leaves the rows blank when the case has no common source", () => {
      const { labels, dates } = capital(intake(none));
      for (const input of [...labels, ...dates]) expect(input).toContain('value=""');
    });

    it("leaves a saved section as saved", () => {
      const evidence = Object.fromEntries(DEVELOPMENT_CAPITAL_ASSUMPTION_KEYS.map((key) => [key, { sourceLabel: "Term Sheet", reviewState: "done" }]));
      const { labels, dates } = capital({ ...intake(common), developmentCapital: { capitalAssumptionEvidence: evidence } });
      for (const input of labels) expect(input).toContain('value="Term Sheet"');
      for (const input of dates) expect(input).toContain('value=""');
    });
  });
});
