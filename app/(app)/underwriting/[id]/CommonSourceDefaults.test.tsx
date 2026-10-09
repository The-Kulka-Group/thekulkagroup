import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CommercialOperations, OtherFundingSource, PermanentLoanPlan, PropertyTaxPlan } from "@kulka/engine";

import { CommercialSection } from "./CommercialSection";
import { OtherSourcesSection } from "./OtherSourcesSection";
import { PermanentLoanSection } from "./PermanentLoanSection";
import { PropertyTaxSection } from "./PropertyTaxSection";

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
