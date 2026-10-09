import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CollapsibleSection } from "./CollapsibleSection";
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
