import { Sheet } from "@/components/Sheet";

export default function Briefs() {
  return (
    <Sheet number="B-100" title="Briefs" bodyClass="sheet-body--board">
      <div className="empty"><p>No briefs have been added.</p></div>
    </Sheet>
  );
}
