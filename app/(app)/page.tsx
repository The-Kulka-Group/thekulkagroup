import Link from "next/link";
import { Sheet, Sep } from "@/components/Sheet";
import { ATTENTION, THIS_WEEK } from "@/lib/data";

// Home leads with what needs the user: plain sentences, newest first, one
// action each. Only red items take the tinted band; amber sits on white, so
// fill itself carries severity.
export default function Home() {
  return (
    <Sheet
      number="H-100"
      title="Home"
      meta={
        <>
          <span className="num">Monday 2026-08-24</span>
          <Sep />
          <span>example data</span>
        </>
      }
      needsReview={4}
      reviewLabel="need you"
      bodyClass="sheet-body--record"
    >
      <div className="record">
        <div className="margin" />
        <div className="col-field sheet-head">
          <h2 className="t-1">Four things need you.</h2>
          <p className="t-meta">Newest first.</p>
        </div>

        <div className="margin" />
        <div className="col-field">
          <div className="redlines">
            {ATTENTION.map((a, i) => (
              <div className="redline-row" key={i}>
                <span className={`dot${a.severity === "waiting" ? " dot--amber" : ""}`} />
                <span className="sentence">
                  {a.sentence}
                  {a.key ? <span className="redline-key">{a.key}</span> : null}
                  {a.tail}
                </span>
                <span className="source">{a.source}</span>
                <button className="btn btn--quiet" type="button">
                  {a.action}
                </button>
              </div>
            ))}
          </div>

          <div className="record-section">
            <h3>This week</h3>
            <table className="doc-list">
              <tbody>
                {THIS_WEEK.map((w) => (
                  <tr key={w.date}>
                    <td className="num t-meta w-date">{w.date}</td>
                    <td>{w.what}</td>
                    <td className="num t-meta right w-sheet">{w.sheet}</td>
                    <td className="right w-rev">
                      <button className="btn btn--quiet" type="button">Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="record-section">
            <h3>Pipeline</h3>
            <p className="t-ui" style={{ padding: "10px 0 4px" }}>
              <span className="em">9 open pursuits</span>: 4 qualifying, 3 proposals out,
              2 awards pending. 3 are stuck.{" "}
              <Link className="btn btn--quiet" href="/pursuits">Open the board</Link>
            </p>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
