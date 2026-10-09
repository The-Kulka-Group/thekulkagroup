import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CollapsibleSection } from "./CollapsibleSection";
import { ReconciliationChecks } from "./ReconciliationChecks";
import { TraceFold } from "./TraceFold";

describe("folded run page sections", () => {
  it("renders a formula trace inside a closed details element", () => {
    const html = renderToStaticMarkup(<TraceFold title="Formula Traces"><table /></TraceFold>);
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("<summary>Formula Traces</summary>");
  });

  it("starts folded when the section asks for it and open otherwise", () => {
    const folded = renderToStaticMarkup(<CollapsibleSection storage="test-folded" title="Saved Evidence Snapshot" defaultCollapsed><p>Body</p></CollapsibleSection>);
    expect(folded).toContain('aria-expanded="false"');
    expect(folded).toContain("hidden");
    const open = renderToStaticMarkup(<CollapsibleSection storage="test-open" title="Facts"><p>Body</p></CollapsibleSection>);
    expect(open).toContain('aria-expanded="true"');
  });
});

describe("reconciliation checks", () => {
  const check = (id: string, status: "pass" | "fail") => ({ id, label: `Check ${id}`, status, expected: 1, actual: status === "pass" ? 1 : 2, difference: status === "pass" ? 0 : 1, unit: "usd" as const, tolerance: 0 });

  it("states one line and folds the full table when every check passes", () => {
    const html = renderToStaticMarkup(<ReconciliationChecks checks={[check("a", "pass"), check("b", "pass")]} />);
    expect(html).toContain("2 of 2 Checks Pass");
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html.indexOf("<details")).toBeLessThan(html.indexOf("Check a"));
  });

  it("lists a failed check in the open", () => {
    const html = renderToStaticMarkup(<ReconciliationChecks checks={[check("a", "pass"), check("b", "fail")]} />);
    expect(html).toContain("1 of 2 Checks Pass");
    expect(html.indexOf("Check b")).toBeLessThan(html.indexOf("<details"));
  });
});
