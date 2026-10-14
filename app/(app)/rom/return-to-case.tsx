"use client";

import { useState } from "react";

import "./return-to-case.css";

// LA-2417. A budget built from an underwriting case carries the way back to
// it. The trip both ways is a full page load, so the browser's view
// transition morphs the case's Hard Costs card into this screen and back
// (daylight.css, "Handoff between underwriting and the ROM").

/** The case a budget is being built for, with the facts the new budget opens on. */
export type ReturnCase = {
  id: string;
  name: string;
  grossSquareFeet?: number;
  units?: number;
  zip?: string;
};

/** Fills the case's hard cost from the budget's newest saved run, then goes back to where the user left the case. */
export async function returnToCase(caseId: string) {
  try {
    await fetch(`/api/underwriting/cases/${caseId}/rom`, { method: "POST" });
  } catch {
    // The case fills itself from the saved run when it opens.
  }
  // A full page load, not router.push: only a document navigation runs the cross-document view transition.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/underwriting/${caseId}?from=rom#hard-costs`);
}

export function ReturnBand({ returnCase }: { returnCase: ReturnCase }) {
  const [leaving, setLeaving] = useState(false);
  return (
    <div className="rom-return-band" role="region" aria-label="Underwriting project">
      <span>
        Building Construction Costs for <strong>{returnCase.name}</strong>
      </span>
      <span className="rom-return-band__note">Your answers save as you go.</span>
      <button
        type="button"
        className="rom-return-band__back"
        disabled={leaving}
        onClick={() => {
          setLeaving(true);
          void returnToCase(returnCase.id);
        }}
      >
        {leaving ? "Going Back…" : "Back to Case"}
      </button>
    </div>
  );
}
