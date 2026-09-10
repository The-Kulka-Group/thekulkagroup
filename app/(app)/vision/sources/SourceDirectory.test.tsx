import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {VISION_SOURCES} from "@/lib/vision/sources";
import {SourceDirectory, SourceDirectoryResults} from "./SourceDirectory";

describe("Vision source directory view", () => {
  it("renders joined coverage counts and source capability labels", () => {
    const html = renderToStaticMarkup(createElement(SourceDirectory, {sources: [...VISION_SOURCES], health: {"nassau-applications": {last_checked_at:"2026-09-09T14:00:00.000Z",last_success_at:"2026-09-09T14:00:00.000Z",last_error:null,last_outcome:"completed",record_count:12,coverage:null,running:false}}}));

    expect(html).toContain("<strong>111</strong><span>local jurisdictions</span>");
    expect(html).toContain("Nassau has 69, and Suffolk has 42.");
    expect(html).toContain("There are 5 county sources and 135 local sources.");
    expect(html).toContain("<strong>140</strong><span>directory sources</span>");
    expect(html).toContain("<strong>9</strong><span>collectable sources</span>");
    expect(html).toContain("What this source publishes");
    expect(html).toContain("Vision can retrieve");
    expect(html).toContain("Fields available from source");
    expect(html).toContain("Manual step or access need");
    expect(html).toContain("Coverage and limits");
    expect(html).toContain("Open official source");
    expect(html).toContain("We checked this source on September 9, 2026.");
    expect(html).toContain("Daily schedule");
    expect(html).toContain("Latest outcome");
    expect(html).toContain("Completed");
    expect(html).toContain("12 records");
    expect(html).toContain("vision-source-access");
    expect(html).toContain("Collectable");
    expect(html).toContain("Manual review");
    expect(html).toContain("Restricted access");
    expect(html).toContain("No public feed");
  });

  it("renders a clear empty result", () => {
    const html = renderToStaticMarkup(createElement(SourceDirectoryResults, {sources: []}));
    expect(html).toContain("No sources match these filters.");
    expect(html).toContain("Change or clear a filter");
  });

  it("offers county, jurisdiction, municipality type, record and access filters", () => {
    const html = renderToStaticMarkup(createElement(SourceDirectory, {sources: [...VISION_SOURCES]}));

    expect(html).toContain(">County<");
    expect(html).toContain(">Location<");
    expect(html).toContain(">Municipality type<");
    expect(html).toContain(">Record type<");
    expect(html).toContain(">Access<");
    expect(html).toContain("All locations");
  });
});
