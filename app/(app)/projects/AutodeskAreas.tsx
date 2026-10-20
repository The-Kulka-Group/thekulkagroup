"use client";

import { useState } from "react";

// LA-2894. The admin readout for one project: which Autodesk areas answer as the
// connected person, and how many records each holds. It reads on demand and
// stores nothing.

type Area = { area: string; status: number; answers: boolean; records: number | null; more: boolean; reason: string | null };

export function AutodeskAreas({ jobId }: { jobId: string }) {
  const [state, setState] = useState<{ busy: boolean; areas: Area[] | null; note: string | null }>({
    busy: false,
    areas: null,
    note: null,
  });

  async function check() {
    setState({ busy: true, areas: null, note: null });
    try {
      const response = await fetch(`/api/autodesk/areas?${new URLSearchParams({ job: jobId })}`);
      const body = (await response.json().catch(() => null)) as { areas?: Area[]; error?: string } | null;
      if (!response.ok || !body?.areas) {
        setState({ busy: false, areas: null, note: body?.error ?? `The check failed with status ${response.status}.` });
        return;
      }
      setState({ busy: false, areas: body.areas, note: null });
    } catch {
      setState({ busy: false, areas: null, note: "Kulka AI could not be reached. Try again." });
    }
  }

  const answering = state.areas?.filter((area) => area.answers).length ?? 0;

  return (
    <section className="jb-areas" aria-labelledby="jb-areas-h">
      <div className="jb-areas-head">
        <h3 id="jb-areas-h" className="jb-h3">Autodesk Areas</h3>
        <button className="jb-btn" type="button" onClick={check} disabled={state.busy}>
          {state.busy ? "Checking…" : state.areas ? "Check Again" : "Check Autodesk Areas"}
        </button>
      </div>
      {state.note ? <p className="jb-note" role="status">{state.note}</p> : null}
      {state.areas ? (
        <>
          <p className="jb-note">
            <span className="num">{answering}</span> of <span className="num">{state.areas.length}</span> areas answer as the connected person. Nothing is saved.
          </p>
          <table className="jb-atable">
            <thead>
              <tr>
                <th scope="col">Area</th>
                <th scope="col">Result</th>
                <th scope="col" className="num">Records</th>
                <th scope="col">Autodesk Says</th>
              </tr>
            </thead>
            <tbody>
              {state.areas.map((area) => (
                <tr key={area.area}>
                  <th scope="row">{area.area}</th>
                  <td>
                    <span className={`jb-state jb-state--${area.answers ? "done" : "stuck"}`}>
                      <i />
                      {area.answers ? "Answers" : area.status ? `Refused ${area.status}` : "No Answer"}
                    </span>
                  </td>
                  <td className="num">
                    {area.records === null ? "" : `${area.records.toLocaleString("en-US")}${area.more ? "+" : ""}`}
                  </td>
                  <td className="jb-reason">{area.reason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </section>
  );
}
