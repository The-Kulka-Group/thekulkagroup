import { Sheet, Sep } from "@/components/Sheet";
import { StatusBlock } from "@/components/Status";
import { PURSUITS, STAGES, OWNER_COLOR } from "@/lib/data";

// The board: grouped rows on a fixed grid, the apparatus margin carrying the
// checkbox and row number, and the load strip reading each stage. A stuck row
// escalates at row level so the board's problems outrank its toolbar.
export default function Pursuits() {
  const byStage = STAGES.map((stage) => ({
    stage,
    rows: PURSUITS.filter((p) => p.stage === stage),
  }));

  return (
    <Sheet
      number="P-101"
      title="Pursuits"
      actions={
        <>
          <button className="btn btn--secondary" type="button">Export</button>
          <button className="btn btn--primary" type="button">New pursuit</button>
        </>
      }
      meta={
        <>
          <span>All open pursuits</span>
          <Sep />
          <span className="num">{PURSUITS.length} pursuits</span>
          <Sep />
          <span>example data</span>
        </>
      }
      needsReview={3}
      bodyClass="sheet-body--board"
      strip={
        <footer className="strip">
          {byStage.map(({ stage, rows }) => {
            const stuck = rows.filter((r) => r.status === "stuck").length;
            return (
              <span className="strip-group" key={stage}>
                <span className="t-label">{stage}</span>
                <span>{rows.length} active</span>
                <span className={`risk${stuck ? " risk--live" : ""}`}>{stuck} stuck</span>
              </span>
            );
          })}
        </footer>
      }
    >
      <table className="board">
        <thead>
          <tr>
            <th className="cell-margin" />
            <th>Pursuit</th>
            <th>Client</th>
            <th>Source</th>
            <th>Owner</th>
            <th className="right">Bid due</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {byStage.map(({ stage, rows }) => (
            <Group key={stage} stage={stage} rows={rows} />
          ))}
        </tbody>
      </table>
    </Sheet>
  );
}

function Group({ stage, rows }: { stage: string; rows: typeof PURSUITS }) {
  return (
    <>
      <tr className="group">
        <th className="cell-margin" />
        <th colSpan={6}>
          <span className="group-title">{stage}</span>
          <span className="group-count t-meta">&nbsp;&nbsp;{rows.length} pursuits</span>
        </th>
      </tr>
      {rows.map((p) => (
        <tr className={`row${p.status === "stuck" ? " row--stuck" : ""}`} key={p.n}>
          <td className="cell-margin">
            <div className="cell-margin-inner">
              <label className="cbx">
                <input type="checkbox" aria-label={`Select ${p.name}`} />
                <svg viewBox="0 0 12 10">
                  <path d="M1.5 5.5 L4.5 8.5 L10.5 1.5" />
                </svg>
              </label>
              <span>{p.n}</span>
            </div>
          </td>
          <td>{p.name}</td>
          <td>{p.client}</td>
          <td>{p.source}</td>
          <td>
            <span className={`owner owner--${OWNER_COLOR[p.owner] ?? 1}`}>{p.owner}</span>
          </td>
          <td className={`num right${p.late ? " due--late" : ""}`}>{p.due}</td>
          <td>
            <StatusBlock status={p.status} />
          </td>
        </tr>
      ))}
    </>
  );
}
