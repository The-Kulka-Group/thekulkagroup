import { Sheet, Sep } from "@/components/Sheet";
import { Chip } from "@/components/Status";

// The record tempo: the header title is the record's subject, not the sheet
// type. A flagged field gives the header's counter a visible destination.
export default function Client() {
  return (
    <Sheet
      number="C-042"
      title="Bergen Holdings (example)"
      actions={
        <>
          <button className="btn btn--secondary" type="button">Log contact</button>
          <button className="btn btn--primary" type="button">New pursuit</button>
        </>
      }
      meta={
        <>
          <span>Commercial owner and developer</span>
          <Sep />
          <span>Client since 2021</span>
          <Sep />
          <span>Relationship owner A. Lang</span>
        </>
      }
      needsReview={1}
      reviewLabel="needs review"
      bodyClass="sheet-body--record"
    >
      <article className="record">
        <div className="margin" />
        <div className="col-field record-section">
          <h3>Profile</h3>
          <dl className="record-grid">
            <Row label="Market" value="Office and retail fit-out" />
            <Row label="Office" value="White Plains, NY" />
            <Row label="Client since" value="2021" num />
            <div className="record-row record-row--flagged">
              <dt className="t-label">Last contact</dt>
              <dd className="num">
                2026-06-25 <span className="flag-why">60 days, past the 45-day mark</span>
              </dd>
            </div>
            <Row label="Projects together" value="6" num />
            <Row label="Source" value="Broker introduction" />
          </dl>
        </div>

        <div className="margin" />
        <div className="col-field record-section">
          <h3>Key contacts</h3>
          <table className="doc-list">
            <tbody>
              <tr>
                <td className="w-lead">D. Reyes</td>
                <td className="t-meta">Director of Development</td>
                <td className="num t-meta right w-date">2026-06-25</td>
              </tr>
              <tr>
                <td className="w-lead">S. Whitfield</td>
                <td className="t-meta">Facilities Lead</td>
                <td className="num t-meta right w-date">2026-05-12</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="margin" />
        <div className="col-field record-section">
          <h3>Open pursuits</h3>
          <table className="doc-list">
            <tbody>
              <tr>
                <td className="num w-sheet">P-101.08</td>
                <td>Fulton Street Lobby</td>
                <td className="w-type"><Chip status="stuck" /></td>
                <td className="num t-meta right w-date">Aug 22</td>
              </tr>
              <tr>
                <td className="num w-sheet">P-101.03</td>
                <td>Tremont Avenue Facade</td>
                <td className="w-type"><Chip status="open" /></td>
                <td className="num t-meta right w-date">Sep 25</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="margin" />
        <div className="col-field record-section">
          <h3>Activity</h3>
          <table className="doc-list">
            <tbody>
              <tr>
                <td className="num t-meta w-date">2026-06-25</td>
                <td>Site walk at Fulton Street with D. Reyes.</td>
              </tr>
              <tr>
                <td className="num t-meta w-date">2026-05-12</td>
                <td>Facilities review call with S. Whitfield.</td>
              </tr>
              <tr>
                <td className="num t-meta w-date">2026-04-03</td>
                <td>Tremont Avenue Facade added as a pursuit.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="margin" />
        <div className="col-field record-section">
          <h3>Briefs</h3>
          <div className="empty empty--inline">
            <p>No briefs for this client yet.</p>
            <button className="btn btn--quiet" type="button">Draft one</button>
          </div>
        </div>
      </article>
    </Sheet>
  );
}

function Row({ label, value, num }: { label: string; value: string; num?: boolean }) {
  return (
    <div className="record-row">
      <dt className="t-label">{label}</dt>
      <dd className={num ? "num" : undefined}>{value}</dd>
    </div>
  );
}
