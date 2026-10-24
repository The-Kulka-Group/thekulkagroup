import type { ChangeRow } from "@/lib/access/read";

import { LEVEL_LABEL, Mark } from "../parts";

// LA-3046, canvas board 4. Newest first: who changed what, from, to and when.
// Nothing here can be edited; a change is undone by making the opposite one.

const WHEN = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

function sentence(c: ChangeRow): string {
  const target = `${c.targetName}${c.targetKind === "department" ? " (Whole Department)" : ""}`;
  if (c.subjectKind === "role") {
    if (c.to === null) return `cleared ${c.subjectName}'s own setting on ${target}`;
    return `set ${c.subjectName} to ${LEVEL_LABEL[c.to]} on ${target}`;
  }
  if (c.to === null) return `removed ${c.subjectName}'s exception on ${target}`;
  return c.from === null
    ? `gave ${c.subjectName} an exception on ${target}`
    : `changed ${c.subjectName}'s exception on ${target}`;
}

function Level({ level }: { level: ChangeRow["from"] }) {
  return level ? (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Mark level={level} />{LEVEL_LABEL[level]}</span>
  ) : (
    <span>No Setting</span>
  );
}

export function ChangeList({ changes }: { changes: readonly ChangeRow[] }) {
  if (changes.length === 0) {
    return (
      <section className="ac-card ac-lead" aria-label="Change Log">
        <span>No access has changed yet. Every change on the Access Map or a person&rsquo;s page shows here.</span>
      </section>
    );
  }
  return (
    <section className="ac-card ac-log" aria-label="Change Log">
      {changes.map((c) => (
        <article key={c.id} className="ac-entry">
          <span className={`ac-tile${c.subjectKind === "person" ? " ac-tile--person" : ""}`} aria-hidden="true">
            {c.subjectKind === "role" ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.5 19 6v5.5c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20c1-3.6 4-5.5 7.5-5.5s6.5 1.9 7.5 5.5" /></svg>
            )}
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="ac-entry-what"><b>{c.changedBy}</b> {sentence(c)}</div>
            <div className="ac-entry-move">
              <Level level={c.from} />
              <span aria-hidden="true">→</span>
              <Level level={c.to} />
              {c.reason ? <span>· {c.reason}</span> : null}
            </div>
          </div>
          <time className="ac-entry-when" dateTime={c.changedAt}>{WHEN.format(new Date(c.changedAt))}</time>
        </article>
      ))}
    </section>
  );
}
