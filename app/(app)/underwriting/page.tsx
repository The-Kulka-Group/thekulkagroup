import Link from "next/link";

import { EditOnly } from "@/components/access/ToolLevel";
import { Sheet, Sep } from "@/components/Sheet";
import { StatusBlock } from "@/components/Status";
import { getDb } from "@/lib/db";
import { listUnderwritingCases } from "@/lib/underwriting/cases";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function UnderwritingPage() {
  const cases = await listUnderwritingCases(getDb());

  return (
    <Sheet
      number="U-100"
      title="Underwriting"
      actions={<EditOnly><Link className="btn btn--primary" href="/underwriting/new">New Project</Link></EditOnly>}
      meta={
        <>
          <span>Ground-up multifamily</span>
          <Sep />
          <span className="num">{cases.length} saved {cases.length === 1 ? "project" : "projects"}</span>
        </>
      }
      bodyClass="sheet-body--board"
    >
      {cases.length === 0 ? (
        <div className="empty">
          <p>No underwriting projects have been saved.</p>
        </div>
      ) : (
        <div className="underwriting-board-wrap">
          <table className="underwriting-board">
            <thead>
              <tr>
                <th>Sheet</th>
                <th>Project</th>
                <th>Address</th>
                <th>Type</th>
                <th>Status</th>
                <th className="right">Updated</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((savedCase) => (
                <tr key={savedCase.id}>
                  <td className="num t-meta">{savedCase.sheetNumber}</td>
                  <td><Link href={`/underwriting/${savedCase.id}`}>{savedCase.name}</Link></td>
                  <td>{savedCase.address}</td>
                  <td>Ground-up multifamily</td>
                  <td><StatusBlock status={savedCase.status} /></td>
                  <td className="num right">{DATE.format(new Date(savedCase.updatedAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Sheet>
  );
}
