import Link from "next/link";

import { Sep, Sheet } from "@/components/Sheet";
import { getDb } from "@/lib/db";
import { readSourceHealth, type SourceStatus } from "@/lib/sources/health";

import { SourceRefresh } from "./SourceRefresh";
import { actionFor, cardState, heroFor, leadLine, scheduleText, sourceHref, TONE } from "./sources-view";
import "./sources.css";

// LA-3050. Settings / Data Sources: one square card per row in data_sources,
// with its health, one hero figure, its schedule and one button. Run history
// sits one click down on each source's page (Rob's golden rule, DESIGN.md).

export const dynamic = "force-dynamic";

function SourceCard({ source, now }: { source: SourceStatus; now: Date }) {
  const state = cardState(source);
  const hero = heroFor(source, now);
  const action = actionFor(source);
  return (
    <article className="ds-card" aria-label={source.name}>
      <div className="ds-card-top">
        <span className="ds-mono" aria-hidden="true">{source.name.charAt(0)}</span>
        <span className={`ds-health ds-tone--${TONE[state]}`}>
          <i />
          {state}
        </span>
      </div>
      <Link className="ds-name" href={sourceHref(source.key)}>
        {source.name}
      </Link>
      <div className="ds-hero">
        <b className={`num${hero.figure.length > 5 ? " ds-hero--word" : ""}${state === "Off" ? " ds-hero--off" : ""}`}>{hero.figure}</b>
        <span>{hero.label}</span>
      </div>
      <div className="ds-foot">
        <span className="ds-schedule">{scheduleText(source, now)}</span>
        {action.kind === "refresh" ? (
          <SourceRefresh />
        ) : (
          <Link className="btn btn--secondary ds-btn" href={action.href} prefetch={false}>
            {action.label}
          </Link>
        )}
      </div>
    </article>
  );
}

export default async function DataSources() {
  const now = new Date();
  const sources = await readSourceHealth(getDb(), now);
  const lead = leadLine(sources);
  return (
    <Sheet
      number="S-200"
      title="Data Sources"
      meta={
        <>
          <span>Settings</span>
          <Sep />
          <span>{sources.length === 1 ? "1 source" : `${sources.length} sources`}</span>
        </>
      }
    >
      <div className="ds-page">
        <section className="ds-lead" aria-label="What needs you">
          <span className={`ds-lead-dot ds-tone--${lead.tone}`}>
            <i />
          </span>
          <p>
            <b>{lead.title}</b>
            {lead.rest ? ` ${lead.rest}` : null}
          </p>
          {lead.action ? (
            <Link className="btn btn--secondary" href={lead.action.href}>
              {lead.action.label}
            </Link>
          ) : null}
        </section>
        <div className="ds-grid">
          {sources.map((source) => (
            <SourceCard key={source.key} source={source} now={now} />
          ))}
        </div>
        <p className="ds-foot-note">Open a source to see its run log.</p>
      </div>
    </Sheet>
  );
}
