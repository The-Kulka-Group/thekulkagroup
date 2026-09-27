"use client";

import { useState } from "react";

import { areaOf, EMPTY, ProjectFields, type Form } from "./NewBudget";

// LA-1110. Edit project: prefilled from the project's own row, saved through
// PATCH /api/rom/projects/[id] with the same parseNewBudget validation New
// budget uses. Saved runs are untouched.
//
// Archive project: sets projects.archived_at through POST
// /api/rom/projects/[id]/archive, behind a plain confirm step. It never
// deletes the row -- projects also holds past jobs the ROM prices benchmarks
// from, so a delete would strip their data out of every other project's
// blend. The project configured for this environment (ROM_PROJECT_ID) cannot
// be archived; the button disables itself with a short reason and the API
// refuses it too.

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
  };
}

export function EditProjectForm({
  project,
  isEnvProject,
  onSaved,
  onArchived,
}: {
  project: EditableProject;
  /** True for the project ROM_PROJECT_ID names; that project cannot be archived. */
  isEnvProject: boolean;
  onSaved: () => void;
  onArchived: () => void;
}) {
  const [form, setForm] = useState<Form>(() => formFrom(project) || EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));

  const area = areaOf(form);
  const ready = form.name.trim() !== "" && Number.isInteger(area) && area > 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
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
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "The project could not be saved.");
        setBusy(false);
        return;
      }
      setBusy(false);
      onSaved();
    } catch {
      setError("The project could not be saved. Check the connection and try again.");
      setBusy(false);
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
      <div className="rb-acts">
        <button className="btn btn--primary" type="submit" disabled={!ready || busy}>
          {busy ? "Saving" : "Save Changes"}
        </button>
      </div>
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
            disabled={busy || isEnvProject}
            title={isEnvProject ? "This project is configured for this environment and cannot be archived." : undefined}
            onClick={() => setConfirmingArchive(true)}
          >
            Archive Project
          </button>
        )}
      </div>
      {isEnvProject ? (
        <p className="rb-pp">This project is configured for this environment and cannot be archived.</p>
      ) : null}
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
