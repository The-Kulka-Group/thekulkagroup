import { Sheet } from "@/components/Sheet";

export default function Clients() {
  return (
    <Sheet number="C-100" title="Clients" bodyClass="sheet-body--board">
      <div className="empty"><p>No clients have been added.</p></div>
    </Sheet>
  );
}
