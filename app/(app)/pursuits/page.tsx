import { Sheet } from "@/components/Sheet";

// The board: grouped rows on a fixed grid, the apparatus margin carrying the
// checkbox and row number, and the load strip reading each stage. A stuck row
// escalates at row level so the board's problems outrank its toolbar.
export default function Pursuits() {
  return (
    <Sheet
      number="P-101"
      title="Pursuits"
      bodyClass="sheet-body--board"
    >
      <div className="empty"><p>No pursuits have been added.</p></div>
    </Sheet>
  );
}
