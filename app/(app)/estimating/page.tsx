import { Sheet } from "@/components/Sheet";

// No estimating records exist in the database yet. CONTEXT.md keeps
// "estimate" for hard-bid work, distinct from the ROM/conceptual-budgeting
// module. This used to render fabricated sample data (projects, clients,
// dollar amounts) with no indication to a viewer that none of it was real,
// which DESIGN.md's banned list rules out in the shipped app. Honest empty
// state instead, matching Home and every other stub page.
export default function EstimatingPage() {
  return (
    <Sheet number="E-100" title="Estimating" bodyClass="sheet-body--record">
      <div className="record">
        <div className="margin" />
        <div className="col-field sheet-head">
          <h2 className="t-1">No estimating records are connected yet.</h2>
          <p className="t-meta">
            The hard-bid pipeline will appear here once it&rsquo;s wired to a real source.
          </p>
        </div>
      </div>
    </Sheet>
  );
}
