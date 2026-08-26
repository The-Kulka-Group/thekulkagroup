import { Sheet, Sep } from "@/components/Sheet";

// The document tempo: numbered clause margins, one attention language for TBDs,
// and an AI draft held until a person accepts it.
export default function Brief() {
  return (
    <Sheet
      number="B-217"
      title="Meeting Brief"
      actions={<button className="btn btn--secondary" type="button">Export PDF</button>}
      meta={
        <>
          <span>Calder Health (example)</span>
          <Sep />
          <span>Rev A</span>
          <Sep />
          <span className="num">Issued 2026-08-24</span>
        </>
      }
      needsReview={1}
      reviewLabel="needs review"
      bodyClass="sheet-body--doc"
    >
      <article className="doc">
        <div className="margin" />
        <div className="col-field">
          <h2 className="t-2 doc-title">Calder Health, Thursday 2026-08-27 (example)</h2>
          <p className="t-meta doc-meta">
            Pre-meeting brief &nbsp;&middot;&nbsp; Prepared for R. K. and J. Park
          </p>
        </div>

        <div className="doc-clause">
          <div className="margin">01</div>
          <div className="col-field">
            <h3 className="t-3">Relationship snapshot</h3>
            <p>
              Calder Health has been a client since 2023 with three completed projects,
              all architect referrals through Wren &amp; Ostrow. Last contact was the
              Harrison Street walkthrough on 2026-08-06. Two pursuits are open:
              Ridgewood Medical Suite (qualifying) and Harrison Street Interiors
              (proposal out).
            </p>
          </div>
        </div>

        <div className="doc-clause">
          <div className="margin">02</div>
          <div className="col-field">
            <h3 className="t-3">What changed since last contact</h3>
            <p>
              The Harrison Street proposal went out 2026-08-14 and has had no response.
              Ridgewood&apos;s equipment schedule arrived 2026-08-20 and shifts the fit-out
              start earlier.
            </p>
            <div className="redline-row" style={{ marginTop: 12 }}>
              <span className="dot dot--amber" />
              <span className="sentence">
                <span className="redline-key">TBD:</span> confirm who attends for Calder.
                The invite lists two names without titles.
              </span>
              <span className="source" />
              <button className="btn btn--quiet" type="button">Resolve</button>
            </div>
          </div>
        </div>

        <div className="doc-clause">
          <div className="margin">03</div>
          <div className="col-field">
            <h3 className="t-3" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              Suggested talking points
              <span className="draft-flag" style={{ marginBottom: 0 }}>
                <span className="dot" /> Draft, not accepted
              </span>
            </h3>
            <p>
              Open with the Harrison Street proposal: ask directly whether the number
              or the schedule is the holdup, and offer the phased alternative already
              priced. On Ridgewood, the earlier equipment delivery is a reason to lock
              the fit-out window this month. Close by asking about the two Rockland
              sites mentioned during the August walkthrough.
            </p>
            <p className="draft-actions">
              <button className="btn btn--primary" type="button">Accept</button>
              <button className="btn btn--secondary" type="button">Edit</button>
              <button className="btn btn--redline" type="button">Discard</button>
            </p>
          </div>
        </div>

        <div className="margin" />
        <div className="col-field revision-block">
          <h3 className="t-label">Revisions</h3>
          <table>
            <tbody>
              <tr>
                <td className="num w-rev">A</td>
                <td className="num w-date">2026-08-24</td>
                <td>Drafted ahead of the 2026-08-27 meeting.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </Sheet>
  );
}
