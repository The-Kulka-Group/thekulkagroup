import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import {DISCOVERY_SOURCES} from "@/lib/vision/discovery-catalog";
import {SourceSelection, SourceSelectionPanel} from "./SourceSelection";

describe("Vision source picker", () => {
  const selected = DISCOVERY_SOURCES.slice(0, 3).map(source => source.id);

  it("renders one collapsed summary without laying out source rows", () => {
    const html = renderToStaticMarkup(createElement(SourceSelection, {selected, onChange: vi.fn()}));

    expect(html).toContain(`Sources</span><span class="vision-source-count">${selected.length} of ${DISCOVERY_SOURCES.length}</span>`);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="vision-source-picker-panel"');
    expect(html).not.toContain('class="vision-source-option"');
    expect(html).not.toContain('id="vision-source-picker-panel"');
  });

  it("renders every source, saved switch state, Done control, and feedback below the open heading", () => {
    const html = renderToStaticMarkup(createElement(SourceSelectionPanel, {selected, onChange: vi.fn(), onDone: vi.fn(), pendingMessage: "Updating discovery sources…", error: "The source choice did not save."}));

    expect(html).toContain('id="vision-source-picker-panel"');
    expect(html).toContain('class="btn btn--quiet vision-source-done"');
    expect(html).toContain(">Done</button>");
    expect(html).toContain('role="status">Updating discovery sources…');
    expect(html).toContain('role="alert">The source choice did not save.');
    expect(html.indexOf('class="vision-source-picker-heading"')).toBeLessThan(html.indexOf('class="vision-source-feedback"'));
    expect(html.indexOf('class="vision-source-feedback"')).toBeLessThan(html.indexOf('class="vision-source-options"'));
    expect((html.match(/role="status"/g) ?? [])).toHaveLength(1);
    expect((html.match(/role="alert"/g) ?? [])).toHaveLength(1);
    expect((html.match(/class="vision-source-option"/g) ?? [])).toHaveLength(DISCOVERY_SOURCES.length);
    expect((html.match(/role="switch"/g) ?? [])).toHaveLength(DISCOVERY_SOURCES.length);
    expect((html.match(/checked=""/g) ?? [])).toHaveLength(selected.length);
    for (const source of DISCOVERY_SOURCES) expect(html).toContain(source.name);
  });

  it("keeps one pending and save-error feedback block next to the closed trigger", () => {
    const html = renderToStaticMarkup(createElement(SourceSelection, {selected, onChange: vi.fn(), disabled: true, pendingMessage: "Updating discovery sources…", error: "The source choice did not save."}));

    expect(html).toContain('class="vision-source-picker-bar"');
    expect(html.indexOf('class="vision-source-trigger"')).toBeLessThan(html.indexOf('class="vision-source-feedback"'));
    expect(html).toContain('role="status">Updating discovery sources…');
    expect(html).toContain('role="alert">The source choice did not save.');
    expect((html.match(/class="vision-source-feedback"/g) ?? [])).toHaveLength(1);
    expect((html.match(/role="status"/g) ?? [])).toHaveLength(1);
    expect((html.match(/role="alert"/g) ?? [])).toHaveLength(1);
    expect(html).not.toContain('id="vision-source-picker-panel"');
  });
});
