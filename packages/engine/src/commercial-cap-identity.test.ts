import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { retailAbatementCase, retailCase } from "./fixtures/commercial-cap-cases";
import { computePropertyReturns } from "./property-returns";

/*
 * LA-1870: with no commercial cap, a run must give the same results as before the cap existed. Each
 * digest is the SHA-256 of a full run's JSON, computed on origin/main at 7c01181 (the LA-1867 merge)
 * with these same inputs. The no-commercial runs are also pinned in permanent-loan-identity.test.ts.
 * These cases carry a commercial block, whose runs gain `commercial` in their NOI input paths (a gap
 * LA-1868 left), so the digest leaves every `inputPaths` list out and the paths get their own test
 * in commercial-cap.test.ts. Any change to a number, label, formula or check moves a digest.
 */
const BEFORE_LA_1870 = {
  retail: "caec99dde898c0006008f5848b3e9605a7d3682872ffa4c226d9b106e38130dc",
  retailAbatementScheduled: "c53643a4cb2546e808373931758743d21543751177fc0126281e266939abd578",
  retailAbatementFull: "38b5184d6cb813061882765adced067bc1d004c4d83e1bf4185b397adb4fe388",
  retailAbatementPlusValue: "5f7cd23ce3adeb4543b3a35ad5fb566a6462dfb1f712baf5380319d0f83c9d7b",
};

const withoutPaths = (value: unknown) =>
  JSON.stringify(value, (key, item) => (key === "inputPaths" ? undefined : item));
const digest = (value: unknown) => createHash("sha256").update(withoutPaths(value)).digest("hex");

describe("runs with commercial space and no commercial cap", () => {
  const runs = {
    retail: computePropertyReturns(retailCase()),
    retailAbatementScheduled: computePropertyReturns(retailAbatementCase("scheduled_tax")),
    retailAbatementFull: computePropertyReturns(retailAbatementCase("full_tax")),
    retailAbatementPlusValue: computePropertyReturns(retailAbatementCase("full_tax_plus_abatement_value")),
  };

  it("complete, so the digests compare real results", () => {
    for (const [name, run] of Object.entries(runs)) expect(run.status, `${name} ${JSON.stringify(run.issues)}`).toBe("complete");
  });

  it("carry commercial income, so the case is not a residential run in disguise", () => {
    for (const run of Object.values(runs)) {
      expect(run.result!.forwardOperations.months.some(({ commercialNetOperatingIncome }) => commercialNetOperatingIncome !== 0)).toBe(true);
    }
  });

  it("match the results from before the commercial cap exactly", () => {
    const digests = Object.fromEntries(Object.entries(runs).map(([name, run]) => [name, digest(run)]));
    expect(digests).toEqual(BEFORE_LA_1870);
  });
});
