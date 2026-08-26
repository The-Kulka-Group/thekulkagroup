import type { ReactNode } from "react";

// The sheet header is two tiers: badge, a 26/800 title, and actions, then a
// hairline meta row carrying the context and the counter pill. The pill says
// what it counts and is absent at zero (DESIGN.md).
export function Sheet({
  number,
  title,
  actions,
  meta,
  needsReview,
  reviewLabel = "need review",
  children,
  strip,
  bodyClass = "",
}: {
  number: string;
  title: string;
  actions?: ReactNode;
  meta?: ReactNode;
  needsReview?: number;
  reviewLabel?: string;
  children: ReactNode;
  strip?: ReactNode;
  bodyClass?: string;
}) {
  return (
    <section className="sheet">
      <header className="band">
        <div className="band-top">
          <span className="band-number">{number}</span>
          <h1 className="band-name">{title}</h1>
          {actions ? <div className="band-actions">{actions}</div> : null}
        </div>
        <div className="band-meta">
          {meta}
          {needsReview ? (
            <button className="band-redlines" type="button">
              <span className="dot" />
              <span className="num">{needsReview}</span>&nbsp;{reviewLabel}
            </button>
          ) : null}
        </div>
      </header>

      <div className={`sheet-body ${bodyClass}`}>{children}</div>
      {strip}
    </section>
  );
}

export function Sep() {
  return <span className="sep">&middot;</span>;
}
