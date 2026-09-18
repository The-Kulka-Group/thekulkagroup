import { Sheet, Sep } from "@/components/Sheet";

// Sample data. No estimating records exist in the database yet; this page
// shows the intended shape so the design can be reviewed before the bid
// pipeline is wired to a real source (CONTEXT.md keeps "estimate" for
// hard-bid work, distinct from the ROM/conceptual-budgeting module).
export const dynamic = "force-static";

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

type PipelineStatus = "intake" | "in_progress" | "submitted" | "won" | "lost";

// The shared Status vocabulary (working/stuck/done/open) carries generic
// labels that don't fit hard-bid stages, so the dot's color comes from that
// vocabulary while the label stays specific to a bid's actual stage.
const STATUS_KIND: Record<PipelineStatus, "neutral" | "working" | "done" | "stuck"> = {
  intake: "neutral",
  in_progress: "working",
  submitted: "working",
  won: "done",
  lost: "stuck",
};
const STATUS_TEXT: Record<PipelineStatus, string> = {
  intake: "Intake",
  in_progress: "In progress",
  submitted: "Submitted",
  won: "Won",
  lost: "Lost",
};

const UPCOMING = [
  { sheet: "E-142", project: "5 Heidi Lane — Li Residence", type: "Bid Due", date: new Date(2026, 8, 22), daysUntil: 4 },
  { sheet: "E-138", project: "Harborview Medical Office", type: "Walkthrough", date: new Date(2026, 8, 24), daysUntil: 6 },
  { sheet: "E-145", project: "Ridgefield Multifamily Phase 2", type: "RFI Due", date: new Date(2026, 8, 25), daysUntil: 7 },
  { sheet: "E-140", project: "Corvelli Warehouse Retrofit", type: "Bid Due", date: new Date(2026, 8, 29), daysUntil: 11 },
];

const PIPELINE: Array<{
  sheet: string;
  project: string;
  client: string;
  status: PipelineStatus;
  bidAmount: number;
  bidDue: Date | null;
}> = [
  { sheet: "E-142", project: "5 Heidi Lane — Li Residence", client: "Li Residence", status: "in_progress", bidAmount: 2_450_000, bidDue: new Date(2026, 8, 22) },
  { sheet: "E-140", project: "Corvelli Warehouse Retrofit", client: "Corvelli Companies", status: "submitted", bidAmount: 4_120_000, bidDue: new Date(2026, 8, 29) },
  { sheet: "E-138", project: "Harborview Medical Office", client: "Phillips Construction", status: "intake", bidAmount: 1_780_000, bidDue: null },
  { sheet: "E-135", project: "60 Banks Street Renovation", client: "Lutz Construction", status: "won", bidAmount: 980_000, bidDue: null },
  { sheet: "E-131", project: "Clipper Yard Expansion", client: "Clipper Construction", status: "lost", bidAmount: 3_300_000, bidDue: null },
];

export default function EstimatingPage() {
  const active = PIPELINE.filter((p) => ["intake", "in_progress", "submitted"].includes(p.status));
  const pipelineValue = active.reduce((acc, p) => acc + p.bidAmount, 0);

  return (
    <Sheet
      number="E-100"
      title="Estimating"
      meta={
        <>
          <span>Hard-bid pipeline</span>
          <Sep />
          <span className="num">{active.length} active</span>
        </>
      }
      bodyClass="sheet-body--record"
    >
      <div className="record estimating-record">
        <div className="margin" />
        <div className="col-field">
          <section className="record-section" aria-labelledby="estimating-summary-heading">
            <h3 id="estimating-summary-heading">This quarter</h3>
            <div className="estimating-summary-band">
              <div>
                <span className="t-label">Pipeline Value</span>
                <strong className="num">{MONEY.format(pipelineValue)}</strong>
              </div>
              <div>
                <span className="t-label">Win Rate, 90 Days</span>
                <strong className="num">62%</strong>
              </div>
              <div>
                <span className="t-label">Avg Cycle Time</span>
                <strong className="num">18 days</strong>
              </div>
              <div>
                <span className="t-label">Awarded Total</span>
                <strong className="num">{MONEY.format(980_000)}</strong>
              </div>
              <div>
                <span className="t-label">Weekly Billable</span>
                <strong className="num">{MONEY.format(31 * 150)}</strong>
                <span className="band-note">31 hrs at $150/hr</span>
              </div>
              <div>
                <span className="t-label">Team Utilization</span>
                <strong className="num">78%</strong>
                <span className="band-note">109 of 140 capacity hrs</span>
              </div>
            </div>
          </section>

          <section className="record-section" aria-labelledby="estimating-upcoming-heading">
            <h3 id="estimating-upcoming-heading">Upcoming dates</h3>
            <div className="estimating-board-wrap">
              <table className="estimating-board">
                <thead>
                  <tr>
                    <th>Sheet</th>
                    <th>Project</th>
                    <th>Type</th>
                    <th className="right">Date</th>
                    <th className="right">Days Until</th>
                  </tr>
                </thead>
                <tbody>
                  {UPCOMING.map((u) => (
                    <tr key={`${u.sheet}-${u.type}`}>
                      <td className="num t-meta">{u.sheet}</td>
                      <td>{u.project}</td>
                      <td>{u.type}</td>
                      <td className="num right">{DATE.format(u.date)}</td>
                      <td className={`num right${u.daysUntil <= 5 ? " due--soon" : ""}`}>{u.daysUntil}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="record-section" aria-labelledby="estimating-pipeline-heading">
            <h3 id="estimating-pipeline-heading">Active pipeline</h3>
            <div className="estimating-board-wrap">
              <table className="estimating-board">
                <thead>
                  <tr>
                    <th>Sheet</th>
                    <th>Project</th>
                    <th>Client</th>
                    <th>Status</th>
                    <th className="right">Bid Amount</th>
                    <th className="right">Bid Due</th>
                  </tr>
                </thead>
                <tbody>
                  {PIPELINE.map((p) => (
                    <tr key={p.sheet}>
                      <td className="num t-meta">{p.sheet}</td>
                      <td>{p.project}</td>
                      <td>{p.client}</td>
                      <td>
                        <span className={`chip chip--${STATUS_KIND[p.status]}`}>
                          <span className="dot" />
                          {STATUS_TEXT[p.status]}
                        </span>
                      </td>
                      <td className="num right">{MONEY.format(p.bidAmount)}</td>
                      <td className="num right">{p.bidDue ? DATE.format(p.bidDue) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </Sheet>
  );
}
