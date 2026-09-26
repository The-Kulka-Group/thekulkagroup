"use client";

import { useState } from "react";

// LA-1107. The New budget form in the black side panel. It asks for what the
// projects table requires (name, project type, construction kind), the area
// the engine prices on, and framing. Nothing else is asked or filled in.

type Form = {
  name: string;
  grossSquareFeet: string;
  projectType: "multifamily" | "self_storage";
  constructionKind: "new" | "renovation";
  framingSystem: "wood" | "metal" | "";
};

const EMPTY: Form = {
  name: "",
  grossSquareFeet: "",
  projectType: "multifamily",
  constructionKind: "new",
  framingSystem: "",
};

export function NewBudgetForm({ onCreated }: { onCreated: (projectId: string) => void }) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));

  const area = Number(form.grossSquareFeet.replace(/,/g, ""));
  const ready = form.name.trim() !== "" && Number.isInteger(area) && area > 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rom/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          grossSquareFeet: area,
          projectType: form.projectType,
          constructionKind: form.constructionKind,
          framingSystem: form.framingSystem || null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.projectId !== "string") {
        setError(body.error ?? "The project could not be added.");
        setBusy(false);
        return;
      }
      onCreated(body.projectId);
    } catch {
      setError("The project could not be added. Check the connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
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
      {error ? (
        <p className="rb-pp rb-pp--error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="rb-acts">
        <button className="btn btn--primary" type="submit" disabled={!ready || busy}>
          {busy ? "Adding and running" : "Add and run ROM"}
        </button>
      </div>
    </form>
  );
}
