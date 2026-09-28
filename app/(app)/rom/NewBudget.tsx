"use client";

import { tier1Flow } from "@/lib/rom/question-flow";

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
  /** LA-1199: the same four facts New budget's Facts step now asks after Gross Area. */
  storiesAboveGrade: string;
  unitCount: string;
  buildingCount: string;
  zip: string;
  /**
   * LA-1212: New budget's Scope step already asks Elevator Count once the
   * elevator gate answers yes (config/rom/tier1-flow.json); this is Edit
   * project's own field for the same fact, so a saved project can have its
   * count set, cleared or corrected without re-running the guided flow.
   */
  elevatorCount: string;
  /**
   * LA-1239: demolition's three building answers, so a saved project that
   * never answered them (or answered them wrong) can get them here. Until
   * they are in, a run leaves the Demolition element out.
   */
  demolitionStructureCount: string;
  demolitionStructureSquareFeet: string;
  demolitionStructureType: string;
  /** LA-1245: Union, Open Shop or Prevailing Wage, or blank. */
  laborType: string;
};

export const EMPTY: Form = {
  name: "",
  grossSquareFeet: "",
  projectType: "multifamily",
  constructionKind: "new",
  framingSystem: "",
  storiesAboveGrade: "",
  unitCount: "",
  buildingCount: "1",
  zip: "",
  elevatorCount: "",
  demolitionStructureCount: "",
  demolitionStructureSquareFeet: "",
  demolitionStructureType: "",
  laborType: "",
};

/** The structure types, worded as config/rom/tier1-flow.json words them. */
const DEMOLITION_TYPE_CHOICES =
  tier1Flow().questions.find((question) => question.id === "demolition_structure_type")?.choices ?? [];

/** Labor Type's choices, worded as config/rom/tier1-flow.json words them. */
const LABOR_TYPE_CHOICES = tier1Flow().questions.find((question) => question.id === "labor_type")?.choices ?? [];

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
    <section className="markup-module" aria-label="Project Facts">
      <div className="markup-grid">
        <label>
          <span className="field-label t-label">Project Name</span>
          <input
            className="input"
            value={form.name}
            disabled={busy}
            required
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <label>
          <span className="field-label t-label">Gross Square Feet</span>
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
          <span className="field-label t-label">Project Type</span>
          <select
            className="input"
            value={form.projectType}
            disabled={busy}
            onChange={(e) => set({ projectType: e.target.value as Form["projectType"] })}
          >
            <option value="multifamily">Multifamily</option>
            <option value="self_storage">Self Storage</option>
          </select>
        </label>
        <label>
          <span className="field-label t-label">Stories Above Grade</span>
          <input
            className="input num"
            inputMode="numeric"
            value={form.storiesAboveGrade}
            disabled={busy}
            onChange={(e) => set({ storiesAboveGrade: e.target.value })}
          />
        </label>
        <label>
          <span className="field-label t-label">Unit Count</span>
          <input
            className="input num"
            inputMode="numeric"
            value={form.unitCount}
            disabled={busy}
            onChange={(e) => set({ unitCount: e.target.value })}
          />
        </label>
        <label>
          <span className="field-label t-label">Building Count</span>
          <input
            className="input num"
            inputMode="numeric"
            value={form.buildingCount}
            disabled={busy}
            onChange={(e) => set({ buildingCount: e.target.value })}
          />
        </label>
        <label>
          <span className="field-label t-label">ZIP</span>
          <input
            className="input"
            maxLength={5}
            inputMode="numeric"
            value={form.zip}
            disabled={busy}
            onChange={(e) => set({ zip: e.target.value })}
          />
        </label>
        <label>
          <span className="field-label t-label">Labor Type</span>
          <select
            className="input"
            value={form.laborType}
            disabled={busy}
            onChange={(e) => set({ laborType: e.target.value })}
          >
            <option value="">Not Set</option>
            {LABOR_TYPE_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label t-label">Elevator Count</span>
          <input
            className="input num"
            inputMode="numeric"
            value={form.elevatorCount}
            disabled={busy}
            onChange={(e) => set({ elevatorCount: e.target.value })}
          />
        </label>
        <label>
          <span className="field-label t-label">Demolition: Structures Coming Down</span>
          <input
            className="input num"
            inputMode="numeric"
            value={form.demolitionStructureCount}
            disabled={busy}
            onChange={(e) => set({ demolitionStructureCount: e.target.value })}
          />
        </label>
        {Number(form.demolitionStructureCount) > 0 ? (
          <>
            <label>
              <span className="field-label t-label">Demolition: Square Feet of Structure</span>
              <input
                className="input num"
                inputMode="numeric"
                value={form.demolitionStructureSquareFeet}
                disabled={busy}
                onChange={(e) => set({ demolitionStructureSquareFeet: e.target.value })}
              />
            </label>
            <label>
              <span className="field-label t-label">Demolition: Structure Type</span>
              <select
                className="input"
                value={form.demolitionStructureType}
                disabled={busy}
                onChange={(e) => set({ demolitionStructureType: e.target.value })}
              >
                <option value="">Choose One</option>
                {DEMOLITION_TYPE_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <label>
          <span className="field-label t-label">Construction</span>
          <select
            className="input"
            value={form.constructionKind}
            disabled={busy}
            onChange={(e) => set({ constructionKind: e.target.value as Form["constructionKind"] })}
          >
            <option value="new">New Construction</option>
            <option value="renovation">Renovation</option>
          </select>
        </label>
        <label>
          <span className="field-label t-label">Framing System</span>
          <select
            className="input"
            value={form.framingSystem}
            disabled={busy}
            onChange={(e) => set({ framingSystem: e.target.value as Form["framingSystem"] })}
          >
            <option value="">Not Set</option>
            <option value="wood">Wood</option>
            <option value="metal">Metal</option>
          </select>
        </label>
      </div>
    </section>
  );
}
