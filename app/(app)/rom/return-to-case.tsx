"use client";

import { useState } from "react";

import { useCanEdit } from "@/components/access/ToolLevel";

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

/**
 * Fills the case's hard cost from the budget's newest saved run, then goes back to where the user
 * left the case. A fill that fails keeps the user here and returns the reason to show.
 */
export async function returnToCase(caseId: string): Promise<string | null> {
  let applied = false;
  try {
    const response = await fetch(`/api/underwriting/cases/${caseId}/rom`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return body.error ?? "The budget could not fill the case. Try Back to Case again.";
    applied = body.applied === true;
  } catch {
    return "The site could not be reached, so the case was not filled. Try Back to Case again.";
  }
  // A full page load, not router.push: only a document navigation runs the cross-document view transition.
  // A budget with no saved run yet goes back without lighting the card as filled.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/underwriting/${caseId}${applied ? "?from=rom" : ""}#hard-costs`);
  return null;
}

/** `error` is a failed return from finishing the budget, which RomRunner starts. */
export function ReturnBand({ returnCase, error }: { returnCase: ReturnCase; error?: string | null }) {
  const canEdit = useCanEdit();
  const [leaving, setLeaving] = useState(false);
  const [ownError, setOwnError] = useState<string | null>(null);
  // LA-3112: going back fills the case, a write, so View goes back without filling it.
  if (!canEdit) {
    return (
      <div className="rom-return-band" role="region" aria-label="Underwriting project">
        <span>
          Construction Costs for <strong>{returnCase.name}</strong>
        </span>
        <a className="rom-return-band__back" href={`/underwriting/${returnCase.id}#hard-costs`}>
          Back to Case
        </a>
      </div>
    );
  }
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
          setOwnError(null);
          void returnToCase(returnCase.id).then((failed) => {
            if (!failed) return;
            setOwnError(failed);
            setLeaving(false);
          });
        }}
      >
        {leaving ? "Going Back…" : "Back to Case"}
      </button>
      {ownError ?? error ? <span className="rom-return-band__error" role="alert">{ownError ?? error}</span> : null}
    </div>
  );
}
