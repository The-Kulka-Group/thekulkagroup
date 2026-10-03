import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RatePanel } from "./RatePanel";

// LA-1526. An unpriced supporting item opens the rate panel, so its
// Inclusions and Exclusions sit there, outside the rate form. An edit of a
// priced item's rate leaves them to that item's block panel.

const noop = () => {};

function panel(editing: boolean) {
  return renderToStaticMarkup(
    <RatePanel projectId="project" runId="run" costCode="28a" driverLabel="Structure Demolition" editing={editing} onSaved={noop} />,
  );
}

describe("RatePanel", () => {
  it("shows the item's Inclusions and Exclusions below the rate form, not inside it", () => {
    const html = panel(false);
    expect(html).toContain('aria-label="Inclusions and Exclusions"');
    expect(html.indexOf("</form>")).toBeLessThan(html.indexOf("Inclusions and Exclusions"));
  });

  it("leaves them out when editing a priced item's rate", () => {
    expect(panel(true)).not.toContain("Inclusions and Exclusions");
  });
});
