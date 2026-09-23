import Link from "next/link";

import { Sheet, Sep } from "@/components/Sheet";
import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { listCostImports } from "@/lib/rom/ingest";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

// LA-978: a simple index of every cost import, linking to each one's own
// review page (./[id]/page.tsx). This page only lists; nothing here changes
// a line's match or approves anything.
export default async function CostImportsPage() {
  const auth = await authorizeRequest();
  const imports = auth.ok ? await listCostImports(getDb()) : [];

  return (
    <Sheet
      number="R-115"
      title="Cost imports"
      meta={
        <>
          <span>{imports.length === 1 ? "1 import" : `${imports.length} imports`}</span>
          <Sep />
          <span>newest first</span>
        </>
      }
    >
      {!auth.ok ? (
        <p className="empty">Sign in with an authorized account to see cost imports.</p>
      ) : imports.length === 0 ? (
        <p className="empty">No cost file has been imported yet.</p>
      ) : (
        <table className="board">
          <thead>
            <tr>
              <th>Import</th>
              <th>Project</th>
              <th>Status</th>
              <th>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {imports.map((costImport) => (
              <tr className="row" key={costImport.id}>
                <td>
                  <Link href={`/rom/imports/${costImport.id}`}>{costImport.exportLabel}</Link>
                </td>
                <td>{costImport.projectName}</td>
                <td>
                  <span className={`chip chip--${costImport.status === "approved" ? "done" : "medium"}`}>
                    <span className="dot" />
                    {costImport.status === "approved" ? "Approved" : "Staged"}
                  </span>
                </td>
                <td className="num">{DATE.format(new Date(costImport.uploadedAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Sheet>
  );
}
