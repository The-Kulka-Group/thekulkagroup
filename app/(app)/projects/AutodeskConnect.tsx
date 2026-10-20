"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// LA-2894. Connect Autodesk signs one Kulka person in to Autodesk, so Kulka can
// read the areas that refuse the app-only sync. Disconnect deletes the saved
// sign-in. Neither ever sees a token.

const OUTCOME: Record<string, string> = {
  connected: "Autodesk is connected.",
  denied: "Autodesk sign-in was cancelled.",
  state: "The Autodesk sign-in could not be matched to this browser. Connect again.",
  failed: "Autodesk did not finish the sign-in. Connect again.",
};

export function AutodeskConnect({
  configured,
  userName,
  outcome,
}: {
  configured: boolean;
  userName: string | null | undefined;
  outcome: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; note: string | null }>({
    busy: false,
    note: outcome ? OUTCOME[outcome] ?? null : null,
  });

  async function disconnect() {
    if (!window.confirm(`Disconnect Autodesk? Kulka stops reading Autodesk as ${userName || "this person"}.`)) return;
    setState({ busy: true, note: null });
    try {
      const response = await fetch("/api/autodesk/connection", { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setState({ busy: false, note: body?.error ?? `Disconnect failed with status ${response.status}.` });
        return;
      }
      setState({ busy: false, note: "Autodesk is disconnected." });
      router.replace("/projects");
      router.refresh();
    } catch {
      setState({ busy: false, note: "Kulka AI could not be reached. Try again." });
    }
  }

  if (!configured) {
    return <span className="jb-sync-note">Autodesk Sign-in Not Set Up</span>;
  }
  return (
    <span className="jb-sync">
      {state.note ? <span className="jb-sync-note" role="status">{state.note}</span> : null}
      {userName !== undefined ? (
        <>
          <span className="jb-who">
            <i aria-hidden="true" />
            Autodesk: {userName || "Connected"}
          </span>
          <button className="jb-btn jb-btn--quiet" type="button" onClick={disconnect} disabled={state.busy}>
            {state.busy ? "Disconnecting…" : "Disconnect"}
          </button>
        </>
      ) : (
        <a className="jb-btn" href="/api/autodesk/connect">
          Connect Autodesk
        </a>
      )}
    </span>
  );
}
