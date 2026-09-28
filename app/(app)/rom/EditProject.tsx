"use client";

import { useEffect, useRef, useState } from "react";

import { areaOf, EMPTY, ProjectFields, type Form } from "./NewBudget";

// LA-1110. Edit project: prefilled from the project's own row, saved through
// PATCH /api/rom/projects/[id] with the same parseNewBudget validation New
// budget uses. Saved runs are untouched.
//
// LA-1240: there is no Save button. Each change saves once the estimator
// pauses typing, and the page records a new run from the saved facts
// (onSaved), the way Run settings does for its answers (LA-1227). A value
// that does not validate yet saves nothing until it does.
//
// Archive project: sets projects.archived_at through POST
// /api/rom/projects/[id]/archive, behind a plain confirm step. It never
// deletes the row -- projects also holds past jobs the ROM prices benchmarks
// from, so a delete would strip their data out of every other project's
// blend. The project configured for this environment (ROM_PROJECT_ID)
// archives like any other (Matt, 2026-09-27).

export type EditableProject = {
  id: string;
  name: string;
  grossSquareFeet: number;
  projectType: "multifamily" | "self_storage";
  constructionKind: "new" | "renovation";
  framingSystem: "wood" | "metal" | null;
  /** LA-1199. Null on a project that predates these fields, or that never answered them. */
  storiesAboveGrade: number | null;
  unitCount: number | null;
  buildingCount: number;
  zip: string | null;
  /** LA-1212. Null on a project never run through New budget's guided flow, or that answered no elevator gate. */
  elevatorCount: number | null;
  /** LA-1239. Null until answered; zero structures is a real answer. */
  demolitionStructureCount: number | null;
  demolitionStructureSquareFeet: number | null;
  demolitionStructureType: string | null;
  /** LA-1245. Null until set. */
  laborType: string | null;
};

function formFrom(project: EditableProject): Form {
  return {
    name: project.name,
    grossSquareFeet: String(project.grossSquareFeet || ""),
    projectType: project.projectType,
    constructionKind: project.constructionKind,
    framingSystem: project.framingSystem ?? "",
    storiesAboveGrade: project.storiesAboveGrade ? String(project.storiesAboveGrade) : "",
    unitCount: project.unitCount ? String(project.unitCount) : "",
    buildingCount: String(project.buildingCount || 1),
    zip: project.zip ?? "",
    // `?? ""` rather than the `||` the other counts above use: zero is a
    // legal, meaningful Elevator Count (no elevator), and `||` would blank it
    // back out on every reload.
    elevatorCount: project.elevatorCount !== null ? String(project.elevatorCount) : "",
    demolitionStructureCount: project.demolitionStructureCount !== null ? String(project.demolitionStructureCount) : "",
    demolitionStructureSquareFeet: project.demolitionStructureSquareFeet
      ? String(project.demolitionStructureSquareFeet)
      : "",
    demolitionStructureType: project.demolitionStructureType ?? "",
    laborType: project.laborType ?? "",
  };
}

export function EditProjectForm({
  project,
  onSaved,
  onArchived,
}: {
  project: EditableProject;
  /** Called after each save with the framing just saved, so Run settings can match it. */
  onSaved: (framing: "wood" | "metal" | "") => void;
  onArchived: () => void;
}) {
  const [form, setForm] = useState<Form>(() => formFrom(project) || EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(form);
  const saving = useRef<Promise<void>>(Promise.resolve());

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function set(patch: Partial<Form>) {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setForm(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void save(latest.current);
    }, 700);
  }

  const area = areaOf(form);
  const ready = form.name.trim() !== "" && Number.isInteger(area) && area > 0;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    void save(latest.current);
  }

  /** Saves the form as it stands. Saves run in order, so a slow one never lands last. */
  function save(form: Form) {
    saving.current = saving.current.then(() => saveNow(form));
    return saving.current;
  }

  async function saveNow(form: Form) {
    const area = areaOf(form);
    if (form.name.trim() === "" || !Number.isInteger(area) || area <= 0) {
      setError("A project needs a name and a gross area above zero. Nothing saves until it has both.");
      return;
    }
    setSaveState("saving");
    setError(null);
    try {
      const response = await fetch(`/api/rom/projects/${encodeURIComponent(project.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          grossSquareFeet: area,
          projectType: form.projectType,
          constructionKind: form.constructionKind,
          framingSystem: form.framingSystem || null,
          storiesAboveGrade: form.storiesAboveGrade ? Number(form.storiesAboveGrade) : null,
          unitCount: form.unitCount ? Number(form.unitCount) : null,
          buildingCount: form.buildingCount ? Number(form.buildingCount) : null,
          zip: form.zip || null,
          // `!== ""` rather than the truthy checks above: "0" is a legal,
          // meaningful Elevator Count and must not be sent as null.
          elevatorCount: form.elevatorCount !== "" ? Number(form.elevatorCount) : null,
          demolitionStructureCount: form.demolitionStructureCount !== "" ? Number(form.demolitionStructureCount) : null,
          // The square feet and type only mean something with structures
          // coming down; with none, they are cleared.
          demolitionStructureSquareFeet:
            Number(form.demolitionStructureCount) > 0 && form.demolitionStructureSquareFeet
              ? Number(form.demolitionStructureSquareFeet)
              : null,
          demolitionStructureType:
            Number(form.demolitionStructureCount) > 0 && form.demolitionStructureType
              ? form.demolitionStructureType
              : null,
          laborType: form.laborType || null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "The project could not be saved.");
        setSaveState("idle");
        return;
      }
      setSaveState("saved");
      onSaved(form.framingSystem);
    } catch {
      setError("The project could not be saved. Check the connection and try again.");
      setSaveState("idle");
    }
  }

  async function archive() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/rom/projects/${encodeURIComponent(project.id)}/archive`, {
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "The project could not be archived.");
        setBusy(false);
        setConfirmingArchive(false);
        return;
      }
      setBusy(false);
      onArchived();
    } catch {
      setError("The project could not be archived. Check the connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <ProjectFields form={form} set={set} busy={busy} />
      {error ? (
        <p className="rb-pp rb-pp--error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="nb-save" role="status">
        {saveState === "saving" ? "Saving" : saveState === "saved" && ready ? "Saved" : ""}
      </p>
      <div className="rb-acts">
        {confirmingArchive ? (
          <>
            <span className="rb-pp">Archive this project? It stays out of the pickers only.</span>
            <button type="button" className="btn" disabled={busy} onClick={() => setConfirmingArchive(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn--redline" disabled={busy} onClick={archive}>
              {busy ? "Archiving" : "Confirm Archive"}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn--redline"
            disabled={busy}
            onClick={() => setConfirmingArchive(true)}
          >
            Archive Project
          </button>
        )}
      </div>
    </form>
  );
}

export function RestorePanel({ projectId, onRestored }: { projectId: string; onRestored: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/rom/projects/${encodeURIComponent(projectId)}/restore`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "The project could not be restored.");
        setBusy(false);
        return;
      }
      setBusy(false);
      onRestored();
    } catch {
      setError("The project could not be restored. Check the connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="rb-none">This project is archived.</p>
      {error ? (
        <p className="rb-pp rb-pp--error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="rb-acts">
        <button type="button" className="btn btn--primary" disabled={busy} onClick={restore}>
          {busy ? "Restoring" : "Restore Project"}
        </button>
      </div>
    </div>
  );
}
