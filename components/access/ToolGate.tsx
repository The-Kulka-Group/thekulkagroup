import type { ReactNode } from "react";

import { Sheet } from "@/components/Sheet";
import type { Level } from "@/lib/access/level";
import { currentViewer } from "@/lib/access/current";
import { viewerLevel, type Viewer } from "@/lib/access/viewer";
import { toolByKey } from "@/lib/tools/catalog";

import { ToolLevelProvider } from "./ToolLevel";

// LA-3047. Every tool's pages sit inside one of these (a layout per tool
// folder). Hidden shows No Access instead of the page. View shows the page
// with a note, its edit controls hidden where the page reads useCanEdit, and
// the server refuses any save with a 403.

export function NoAccess({ toolLabel, viewer }: { toolLabel: string; viewer: Viewer }) {
  const who = viewer.viewingAs ? viewer.viewingAs.name : "You";
  return (
    <Sheet number="NA" title="No Access" meta={<span>{toolLabel}</span>}>
      <div className="sheet-body--record" style={{ padding: "var(--s8)" }}>
        <p className="t-body" style={{ margin: 0, maxWidth: "62ch" }}>
          {who} cannot open {toolLabel}. An Owner can change that on People and Access.
        </p>
      </div>
    </Sheet>
  );
}

export function ViewOnlyNote({ toolLabel }: { toolLabel: string }) {
  return (
    <div className="view-only-note" role="note">
      <span className="dot" aria-hidden="true" />
      <span><b>View Only.</b> You can look through {toolLabel}, but changes will not save.</span>
    </div>
  );
}

export function GateBody({ level, toolLabel, viewer, children }: { level: Level; toolLabel: string; viewer: Viewer; children?: ReactNode }) {
  if (level === "hidden") return <NoAccess toolLabel={toolLabel} viewer={viewer} />;
  return (
    <ToolLevelProvider level={level}>
      {level === "view" ? (
        <div className="field-stack">
          <ViewOnlyNote toolLabel={toolLabel} />
          {children}
        </div>
      ) : (
        children
      )}
    </ToolLevelProvider>
  );
}

export async function ToolGate({ tool, children }: { tool: string; children: ReactNode }) {
  const viewer = await currentViewer();
  return (
    <GateBody level={viewerLevel(viewer, tool)} toolLabel={toolByKey(tool)?.label ?? "This Tool"} viewer={viewer}>
      {children}
    </GateBody>
  );
}
