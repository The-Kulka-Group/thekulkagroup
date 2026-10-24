"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// LA-2858. Runs the Autodesk project sync on demand (LA-2283) and reloads the
// list. The hourly refresh schedule runs the same sync without anyone asking (LA-3049).

export function JobSync() {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; note: string | null }>({ busy: false, note: null });

  async function refresh() {
    setState({ busy: true, note: null });
    try {
      const response = await fetch("/api/jobs/sync", { method: "POST" });
      const body = (await response.json().catch(() => null)) as { jobs?: number; error?: string } | null;
      if (!response.ok) {
        setState({ busy: false, note: body?.error ?? `The refresh failed with status ${response.status}.` });
        return;
      }
      setState({ busy: false, note: `${body?.jobs ?? 0} projects read from Autodesk` });
      router.refresh();
    } catch {
      setState({ busy: false, note: "Autodesk could not be reached. Try again." });
    }
  }

  return (
    <span className="jb-sync">
      {state.note ? <span className="jb-sync-note" role="status">{state.note}</span> : null}
      <button className="jb-btn" type="button" onClick={refresh} disabled={state.busy}>
        {state.busy ? "Refreshing…" : "Refresh From Autodesk"}
      </button>
    </span>
  );
}
