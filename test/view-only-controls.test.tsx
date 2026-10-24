import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ToolLevelProvider } from "@/components/access/ToolLevel";
import type { Level } from "@/lib/access/level";
import type { UnderwritingCase } from "@/lib/underwriting/cases";

// LA-3112: each tool's main save or create control shows with Edit and is
// gone with View. The server already answers 403 to the write (LA-3047).

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { RomRunner } = await import("@/app/(app)/rom/RomRunner");
const { JobConfidence } = await import("@/app/(app)/rom/imports/[id]/JobConfidence");
const { PropertyReturnsEditor } = await import("@/app/(app)/underwriting/[id]/PropertyReturnsEditor");
const { RunUnderwriting } = await import("@/app/(app)/underwriting/[id]/RunUnderwriting");
const { OpportunityForm } = await import("@/app/(app)/vision/OpportunityForm");
const { JobSync } = await import("@/app/(app)/projects/JobSync");
const { JobPicker } = await import("@/app/(app)/meetings/JobPicker");
const { default: EstimatingPage } = await import("@/app/(app)/estimating/page");
const { default: ClientsPage } = await import("@/app/(app)/clients/page");

function render(level: Level, node: ReactNode) {
  return renderToStaticMarkup(<ToolLevelProvider level={level}>{node}</ToolLevelProvider>);
}

function both(node: ReactNode) {
  return { edit: render("edit", node), view: render("view", node) };
}

const savedCase = {
  id: "case-1",
  caseRevision: 3,
  costSchedule: { saleMonth: "2030-12", costLines: [] },
  apartmentOperations: {},
  developmentCapital: {},
  propertyReturns: null,
} as unknown as UnderwritingCase;

describe("View hides each tool's save and create controls", () => {
  it("Conceptual Budget: New Budget and the job score", () => {
    const runner = both(<RomRunner />);
    expect(runner.edit).toContain(">New Budget</button>");
    expect(runner.view).not.toContain("New Budget");
    const score = both(<JobConfidence projectId="p-1" projectName="Job A" initial={null} />);
    expect(score.edit).toContain("Add Score");
    expect(score.view).not.toContain("Add Score");
    expect(score.view).toContain("Not Scored");
  });

  it("Underwriting: Save Sale Plan and Run Calculation, with the fields disabled", () => {
    const editor = both(<PropertyReturnsEditor savedCase={savedCase} />);
    expect(editor.edit).toContain("Save Sale Plan");
    expect(editor.view).not.toContain("Save Sale Plan");
    expect(editor.edit).not.toMatch(/<fieldset[^>]*disabled/);
    expect(editor.view).toMatch(/<fieldset class="edit-fieldset" disabled/);
    const run = both(<RunUnderwriting caseId="case-1" caseRevision={3} hasRun={false} />);
    expect(run.edit).toContain("Run calculation");
    expect(run.view).toBe("");
  });

  it("Vision: Save Opportunity, with the fields disabled", () => {
    const form = both(<OpportunityForm />);
    expect(form.edit).toContain("Save Opportunity</button>");
    expect(form.view).not.toContain("Save Opportunity</button>");
    expect(form.view).toContain("Back to Opportunities");
    expect(form.view).toMatch(/id="vision-name"[^>]*disabled/);
  });

  it("Projects: Refresh From Autodesk", () => {
    const sync = both(<JobSync />);
    expect(sync.edit).toContain("Refresh From Autodesk");
    expect(sync.view).toBe("");
  });

  it("Meetings: the project picker becomes the project's name", () => {
    const jobs = [{ id: "j-1", label: "Job A" }];
    const picker = both(<JobPicker meetingId="m-1" jobId="j-1" internal={false} jobs={jobs} />);
    expect(picker.edit).toContain('aria-haspopup="listbox"');
    expect(picker.view).not.toContain('aria-haspopup="listbox"');
    expect(picker.view).toContain("Job A");
  });

  it("Estimating and Clients have no save controls to hide", () => {
    for (const html of [render("view", <EstimatingPage />), render("view", <ClientsPage />)]) {
      expect(html).not.toMatch(/<(button|form|input|select|textarea)\b/);
    }
  });
});
