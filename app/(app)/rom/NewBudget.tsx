"use client";

// LA-1107. `Form`, `EMPTY`, `areaOf` and `ProjectFields` back the Edit project
// panel (EditProject.tsx, LA-1110): the same four facts plus framing, and
// nothing else, exactly as New budget always asked for them.
//
// New budget itself is the guided flow in GuidedNewBudget.tsx (LA-1141): it
// asks these same facts on its first step, plus parking type, the nine scope
// gates, and GRs/GCs, before adding the project. This file no longer renders
// a New budget form of its own.

export type Form = {
  name: string;
  grossSquareFeet: string;
  projectType: "multifamily" | "self_storage";
  constructionKind: "new" | "renovation";
  framingSystem: "wood" | "metal" | "";
};

export const EMPTY: Form = {
  name: "",
  grossSquareFeet: "",
  projectType: "multifamily",
  constructionKind: "new",
  framingSystem: "",
};

export function areaOf(form: Form): number {
  return Number(form.grossSquareFeet.replace(/,/g, ""));
}

export function ProjectFields({
  form,
  set,
  busy,
}: {
  form: Form;
  set: (patch: Partial<Form>) => void;
  busy: boolean;
}) {
  return (
    <section className="markup-module" aria-label="Project facts">
      <div className="markup-grid">
        <label>
          <span className="field-label t-label">Project name</span>
          <input
            className="input"
            value={form.name}
            disabled={busy}
            required
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <label>
          <span className="field-label t-label">Gross square feet</span>
          <input
            className="input num"
            inputMode="numeric"
            value={form.grossSquareFeet}
            disabled={busy}
            required
            onChange={(e) => set({ grossSquareFeet: e.target.value })}
          />
        </label>
        <label>
          <span className="field-label t-label">Project type</span>
          <select
            className="input"
            value={form.projectType}
            disabled={busy}
            onChange={(e) => set({ projectType: e.target.value as Form["projectType"] })}
          >
            <option value="multifamily">Multifamily</option>
            <option value="self_storage">Self storage</option>
          </select>
        </label>
        <label>
          <span className="field-label t-label">Construction</span>
          <select
            className="input"
            value={form.constructionKind}
            disabled={busy}
            onChange={(e) => set({ constructionKind: e.target.value as Form["constructionKind"] })}
          >
            <option value="new">New construction</option>
            <option value="renovation">Renovation</option>
          </select>
        </label>
        <label>
          <span className="field-label t-label">Framing system</span>
          <select
            className="input"
            value={form.framingSystem}
            disabled={busy}
            onChange={(e) => set({ framingSystem: e.target.value as Form["framingSystem"] })}
          >
            <option value="">Not set</option>
            <option value="wood">Wood</option>
            <option value="metal">Metal</option>
          </select>
        </label>
      </div>
    </section>
  );
}
