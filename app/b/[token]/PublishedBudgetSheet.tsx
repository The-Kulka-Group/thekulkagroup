import type { PublishedBudgetView } from "@/lib/rom/published-budgets";
import { headlineFigures, type PublishedStage } from "@/lib/rom/published-snapshot";

import "./published.css";

// LA-1417. A plain placeholder for the published page: the headline figures
// from the snapshot, on Daylight. It renders only what it is handed, so the
// real page (LA-1416, LA-1418) can replace it without touching the loading.

const STAGE_NAMES: Record<PublishedStage, string> = {
  conceptual: "Conceptual Budget",
  design_development: "Design Development",
  pre_construction: "Pre-Construction",
  final: "Final",
};

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "America/New_York" });

export function PublishedBudgetSheet({ view }: { view: PublishedBudgetView }) {
  if (view.state === "withdrawn") {
    return (
      <main className="published">
        <article className="published-sheet">
          <p className="t-label">The Kulka Group</p>
          <h1 className="published-title">This budget was withdrawn</h1>
          <p className="t-body">
            Version {view.version} is no longer open. Ask {view.preparedBy ?? "The Kulka Group"} for the current figures.
          </p>
        </article>
      </main>
    );
  }

  const { snapshot } = view;
  const figures = headlineFigures(snapshot);
  const { copy } = snapshot;
  return (
    <main className="published">
      {view.newer ? (
        <p className="published-band" role="note">
          Version {view.newer.version} replaces this budget.{" "}
          <a href={`/b/${view.newer.token}`}>Open Version {view.newer.version}</a>
        </p>
      ) : null}
      <article className="published-sheet">
        <p className="t-label">
          The Kulka Group · {STAGE_NAMES[view.stage]} · Version {view.version}
        </p>
        <h1 className="published-title">{snapshot.project.name}</h1>
        {copy.coverSentence ? <p className="t-body">{copy.coverSentence}</p> : null}

        <dl className="published-figures">
          <div>
            <dt className="t-label">Kulka Contract</dt>
            <dd className="published-figure num">{dollars.format(figures.kulkaContract.likely)}</dd>
            <dd className="t-meta num">
              {dollars.format(figures.kulkaContract.low)} to {dollars.format(figures.kulkaContract.high)}
            </dd>
            {figures.perGrossSquareFoot !== null ? (
              <dd className="t-meta num">{cents.format(figures.perGrossSquareFoot)} per gross square foot</dd>
            ) : null}
          </div>
          <div>
            <dt className="t-label">Total Project Cost</dt>
            <dd className="published-figure num">{dollars.format(figures.totalProjectCost.likely)}</dd>
            <dd className="t-meta num">
              {dollars.format(figures.totalProjectCost.low)} to {dollars.format(figures.totalProjectCost.high)}
            </dd>
          </div>
        </dl>

        <dl className="published-meta">
          {copy.preparedFor ? (
            <div>
              <dt className="t-label">Prepared For</dt>
              <dd className="t-ui">{copy.preparedFor}</dd>
            </div>
          ) : null}
          {copy.preparedBy ? (
            <div>
              <dt className="t-label">Prepared By</dt>
              <dd className="t-ui">{copy.preparedBy}</dd>
            </div>
          ) : null}
          <div>
            <dt className="t-label">Issued</dt>
            <dd className="t-ui">{day.format(new Date(view.issuedAt))}</dd>
          </div>
        </dl>
        {copy.validityDays !== null ? (
          <p className="t-meta">Figures valid {copy.validityDays} days from issue.</p>
        ) : null}
      </article>
    </main>
  );
}
