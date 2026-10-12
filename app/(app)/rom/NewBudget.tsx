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
  /** LA-1245: Union, Open Shop or Prevailing Wage. Open Shop unless stated (Matt, 2026-09-28). */
  laborType: string;
  /** LA-2274: Parking Type and the balcony answers, so a saved budget can correct them. */
  parkingType: string;
  balconyType: string;
  balconyCount: string;
  balconyDeckSquareFeet: string;
  balconyRailLinearFeet: string;
  julietCount: string;
  julietRailLinearFeet: string;
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
  laborType: "open_shop",
  parkingType: "",
  balconyType: "",
  balconyCount: "",
  balconyDeckSquareFeet: "",
  balconyRailLinearFeet: "",
  julietCount: "",
  julietRailLinearFeet: "",
};

/** The structure types, worded as config/rom/tier1-flow.json words them. */
const DEMOLITION_TYPE_CHOICES =
  tier1Flow().questions.find((question) => question.id === "demolition_structure_type")?.choices ?? [];

/** A question in config/rom/tier1-flow.json, for its wording and choices. */
function flowQuestion(id: string) {
  return tier1Flow().questions.find((question) => question.id === id);
}

/** LA-2274: the balcony numbers each balcony type opens, worded as the flow words them. */
const BALCONY_FIELDS: Record<string, (keyof Form & string)[]> = {
  full: ["balconyCount", "balconyDeckSquareFeet", "balconyRailLinearFeet"],
  juliet: ["julietCount", "julietRailLinearFeet"],
};
const BALCONY_QUESTION_IDS: Record<string, string> = {
  balconyCount: "balcony_count",
  balconyDeckSquareFeet: "balcony_deck_square_feet",
  balconyRailLinearFeet: "balcony_rail_linear_feet",
  julietCount: "juliet_count",
  julietRailLinearFeet: "juliet_rail_linear_feet",
};

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
          <span className="field-label t-label">Parking Type</span>
          <select
            className="input"
            value={form.parkingType}
            disabled={busy}
            onChange={(e) => set({ parkingType: e.target.value })}
          >
            <option value="">Choose One</option>
            {flowQuestion("parking_type")?.choices?.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label t-label">Balcony Type</span>
          <select
            className="input"
            value={form.balconyType}
            disabled={busy}
            onChange={(e) => set({ balconyType: e.target.value })}
          >
            <option value="">Not Answered</option>
            {flowQuestion("balcony_type")?.choices?.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
        {(BALCONY_FIELDS[form.balconyType] ?? []).map((field) => (
          <label key={field}>
            <span className="field-label t-label">{flowQuestion(BALCONY_QUESTION_IDS[field])?.prompt}</span>
            <input
              className="input num"
              inputMode="decimal"
              value={form[field]}
              disabled={busy}
              onChange={(e) => set({ [field]: e.target.value })}
            />
          </label>
        ))}
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
