import { Sheet } from "@/components/Sheet";

// Home leads with what needs the user: plain sentences, newest first, one
// action each. Only red items take the tinted band; amber sits on white, so
// fill itself carries severity.
export default function Home() {
  return (
    <Sheet
      number="H-100"
      title="Home"
      bodyClass="sheet-body--record"
    >
      <div className="record">
        <div className="margin" />
        <div className="col-field sheet-head">
          <h2 className="t-1">No live records are connected to Home yet.</h2>
          <p className="t-meta">New activity will appear here when its source is connected.</p>
        </div>

      </div>
    </Sheet>
  );
}
