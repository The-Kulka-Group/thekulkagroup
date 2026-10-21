"use client";

import { useDeferredValue, useEffect, useMemo, useState, type KeyboardEvent } from "react";

import type { ConfidenceFlag, ParameterName, ProvenanceKind } from "@kulka/engine";

import type { ImpactData, ParameterHistoryEntry } from "@/lib/rom/parameters";

import {
  changedNames,
  currentValues,
  draftsFor,
  FLAG_WORDS,
  formatValue,
  impactRows,
  inputText,
  money,
  newestFirst,
  nudge,
  problemsByName,
  signedPercent,
  SOURCES,
  TIERS,
  valuesFrom,
  weightShares,
  wholePercent,
  WORKED_EXAMPLE,
  workedExample,
  type Drafts,
  type WorkedExampleView,
} from "./parameters-view";

// LA-866: the Engine Parameters screen, built to the pass 2 mockup Matt
// approved on 2026-09-27. Every figure about a blend or a flag comes from the
// engine through parameters-view.ts; this file lays it out and saves.

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function dateWords(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? iso : DATE.format(parsed);
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "refused"; message: string; problems: Partial<Record<ParameterName, string>> };

export type ParametersScreenProps = {
  history: ParameterHistoryEntry[];
  impact: ImpactData;
  /** Optional overrides so a test can render an edited state. */
  initialDrafts?: Partial<Drafts>;
  initialReason?: string;
  /** Rows whose history starts open: a parameter name, or `tier.<flag>`. */
  initialOpen?: string[];
};

export function ParametersScreen({ history: initialHistory, impact, initialDrafts, initialReason, initialOpen }: ParametersScreenProps) {
  const [history, setHistory] = useState(initialHistory);
  const base = useMemo(() => currentValues(history), [history]);
  const [drafts, setDrafts] = useState<Drafts>(() => ({ ...draftsFor(currentValues(initialHistory)), ...initialDrafts }));
  const [reason, setReason] = useState(initialReason ?? "");
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(initialOpen));
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [toast, setToast] = useState<string | null>(null);

  const values = useMemo(() => valuesFrom(drafts), [drafts]);
  const problems = useMemo(() => {
    const own = problemsByName(values);
    return save.kind === "refused" ? { ...save.problems, ...own } : own;
  }, [values, save]);
  const changed = useMemo(() => changedNames(base, values), [base, values]);
  const hasProblems = Object.keys(problemsByName(values)).length > 0;
  const example = useMemo(() => workedExample(values), [values]);
  const shares = useMemo(() => weightShares(values), [values]);

  // The impact panel runs the whole engine twice per saved run, so it reads a
  // deferred copy of the values and never holds up a slider.
  const deferred = useDeferredValue(values);
  const deferredOk = useMemo(() => Object.keys(problemsByName(deferred)).length === 0, [deferred]);
  const impactList = useMemo(
    () => (deferredOk ? impactRows(impact, base, deferred) : []),
    [impact, base, deferred, deferredOk],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  function setDraft(name: ParameterName, text: string) {
    setDrafts((d) => ({ ...d, [name]: text }));
    if (save.kind === "refused") setSave({ kind: "idle" });
  }

  function onKey(name: ParameterName, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const next = nudge(name, values[name], event.key === "ArrowUp" ? 1 : -1, event.shiftKey);
    setDraft(name, inputText(name, next));
  }

  function toggle(key: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function discard() {
    setDrafts(draftsFor(base));
    setReason("");
    setSave({ kind: "idle" });
  }

  const reasonWritten = reason.trim().length > 0;
  const canSave = changed.length > 0 && !hasProblems && reasonWritten && save.kind !== "saving";

  async function submit() {
    if (!canSave) return;
    setSave({ kind: "saving" });
    const body = { values: Object.fromEntries(changed.map((name) => [name, values[name]])), reason };
    try {
      const response = await fetch("/api/rom/parameters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        const byName: Partial<Record<ParameterName, string>> = {};
        for (const p of (result.problems ?? []) as { name: ParameterName; message: string }[]) byName[p.name] ??= p.message;
        setSave({ kind: "refused", message: result.error ?? "The change was not saved.", problems: byName });
        return;
      }
      const saved = result.saved as ParameterHistoryEntry[];
      setHistory((h) => [...saved, ...h]);
      setReason("");
      setSave({ kind: "idle" });
      setToast(`Saved ${saved.length} ${saved.length === 1 ? "change" : "changes"}. The next ROM run uses ${saved.length === 1 ? "it" : "them"}.`);
    } catch {
      setSave({ kind: "refused", message: "The change could not reach the server, so nothing was saved.", problems: {} });
    }
  }

  const hint =
    save.kind === "refused"
      ? save.message
      : hasProblems
        ? "Fix the marked values first."
        : !reasonWritten
          ? "A reason is required to save."
          : "Saves as new history rows. The next ROM run uses them.";

  return (
    <div className="pm">
      <div className="pm-grid">
        <div className="pm-main">
          <section className="pm-card" aria-labelledby="pm-weights">
            <h2 id="pm-weights">
              Blend Weights <small>How much each source counts against the others</small>
            </h2>
            <div className="pm-share" aria-hidden="true">
              {SOURCES.map((s) => (
                <span key={s.kind} className={`pm-k--${s.kind}`} style={{ flexGrow: shares[s.kind] }} />
              ))}
            </div>
            <div className="pm-rows">
              {SOURCES.map((s) => (
                <ParameterRow
                  key={s.name}
                  name={s.name}
                  label={s.label}
                  sub={s.sub}
                  swatch={s.kind}
                  unit="×"
                  draft={drafts[s.name]}
                  problem={problems[s.name]}
                  changed={changed.includes(s.name)}
                  share={shares[s.kind]}
                  slider
                  history={history}
                  open={open.has(s.name)}
                  onToggle={() => toggle(s.name)}
                  onChange={(text) => setDraft(s.name, text)}
                  onKey={(e) => onKey(s.name, e)}
                />
              ))}
            </div>
          </section>

          <section className="pm-card" aria-labelledby="pm-tiers">
            <h2 id="pm-tiers">
              Confidence and Range <small>What a line needs for each flag, and how wide its range is</small>
            </h2>
            <div className="pm-ladder">
              {TIERS.map(({ flag, label }) => (
                <TierRow
                  key={flag}
                  flag={flag}
                  label={label}
                  drafts={drafts}
                  problems={problems}
                  changed={changed}
                  hit={example?.blend.confidence === flag}
                  example={example}
                  history={history}
                  open={open.has(`tier.${flag}`)}
                  onToggle={() => toggle(`tier.${flag}`)}
                  onChange={setDraft}
                  onKey={onKey}
                />
              ))}
            </div>
          </section>

          <section className="pm-card" aria-labelledby="pm-markups">
            <h2 id="pm-markups">
              Markups <small>The fee and insurance every ROM starts from</small>
            </h2>
            <div className="pm-rows">
              {(
                [
                  ["fee.rate", "Fee", "Kulka's Fee, Computed on Trade Cost Plus GRs/GCs"],
                  ["insurance.rate", "Insurance", "Kulka's Insurance, Computed on Cost Plus Fee"],
                ] as const
              ).map(([name, label, sub]) => (
                <ParameterRow
                  key={name}
                  name={name}
                  label={label}
                  sub={sub}
                  unit="%"
                  draft={drafts[name]}
                  problem={problems[name]}
                  changed={changed.includes(name)}
                  history={history}
                  open={open.has(name)}
                  onToggle={() => toggle(name)}
                  onChange={(text) => setDraft(name, text)}
                  onKey={(e) => onKey(name, e)}
                />
              ))}
            </div>
            <p className="pm-foot">One ROM can still use its own fee or insurance in Run Settings. This sets the default.</p>
          </section>

          <section className="pm-card" aria-labelledby="pm-confidence">
            <h2 id="pm-confidence">
              Estimator Confidence <small>Which scored ProEst budgets stay out of the blend</small>
            </h2>
            <div className="pm-rows">
              <ParameterRow
                name="confidence.exclude_at_or_below"
                label="Leave Out Jobs Scored At or Below"
                sub="A Quick Takeoff Is Not a Full Project Cost"
                unit="of 10"
                draft={drafts["confidence.exclude_at_or_below"]}
                problem={problems["confidence.exclude_at_or_below"]}
                changed={changed.includes("confidence.exclude_at_or_below")}
                history={history}
                open={open.has("confidence.exclude_at_or_below")}
                onToggle={() => toggle("confidence.exclude_at_or_below")}
                onChange={(text) => setDraft("confidence.exclude_at_or_below", text)}
                onKey={(e) => onKey("confidence.exclude_at_or_below", e)}
              />
            </div>
            <p className="pm-foot">
              Every other scored ProEst budget counts its score out of 10. Actual job cost is never scored.
            </p>
          </section>
          <p className="pm-foot">
            Every change keeps the old value in its history. A backtest writes its own values, marked Backtest.
          </p>
        </div>

        <aside className="pm-card pm-example" aria-live="polite" aria-labelledby="pm-example">
          <div>
            <h2 id="pm-example">Worked Example</h2>
            <p className="pm-line">Your worked case from Sep 21: one line, four sources, $ per GSF.</p>
          </div>
          {example ? <ExampleBody example={example} /> : <p className="pm-muted">Fix the marked values to see the example.</p>}

          <div className="pm-impact">
            <h3>What Your Change Would Do</h3>
            <p className="pm-muted">
              Saved ROMs keep the values they used. This shows what the newest run of each project would read on
              its next run, over today&apos;s data.
            </p>
            {!deferredOk ? (
              <p className="pm-muted">Fix the marked values to see the effect.</p>
            ) : impactList.length === 0 ? (
              <p className="pm-muted">No saved run yet, so there is nothing to compare.</p>
            ) : (
              <ul className="pm-imp-list">
                {impactList.map((row) => (
                  <li className="pm-imp" key={row.runId}>
                    <span>
                      {row.projectName}
                      <span className="pm-imp-gsf num"> · {Math.round(row.grossSquareFeet / 1000)}K GSF</span>
                    </span>
                    {row.error !== null ? (
                      <span className="pm-imp-err">Could not recompute: {row.error}</span>
                    ) : (
                      <>
                        {changed.length > 0 ? <s className="pm-imp-before num">{money(row.before!)}</s> : <span />}
                        <span className="pm-imp-after num">
                          {money(row.after!)}
                          <ChangeChip change={row.change!} />
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <div className={`pm-tray${changed.length > 0 ? " pm-tray--on" : ""}`} role="region" aria-label="Unsaved changes" aria-hidden={changed.length === 0 ? true : undefined} inert={changed.length === 0}>
        <div className="pm-tray-top">
          <span className="pm-dot pm-dot--changed" />
          {changed.length} {changed.length === 1 ? "Change" : "Changes"} Not Saved
        </div>
        <ul className="pm-tray-list num">
          {changed.map((name) => (
            <li key={name}>
              {name} {formatValue(name, base[name])} → {formatValue(name, values[name])}
            </li>
          ))}
        </ul>
        <label className="pm-tray-reason">
          Reason for This Change
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why these values, in plain words. It is saved with every changed row."
            aria-required="true"
          />
        </label>
        <div className="pm-tray-act">
          <span className="pm-tray-hint" role={save.kind === "refused" ? "alert" : undefined}>
            {hint}
          </span>
          <button type="button" className="pm-btn" onClick={discard}>
            Discard
          </button>
          <button type="button" className="pm-btn pm-btn--primary" disabled={!canSave} onClick={submit}>
            {save.kind === "saving" ? "Saving" : "Save Changes"}
          </button>
        </div>
      </div>
      <div className={`pm-toast${toast ? " pm-toast--on" : ""}`} role="status">
        {toast}
      </div>
    </div>
  );
}

function ChangeChip({ change }: { change: number }) {
  const cls = Math.abs(change) < 0.0005 ? "same" : change > 0 ? "up" : "down";
  return <span className={`pm-delta pm-delta--${cls}`}>{cls === "same" ? "No Change" : signedPercent(change)}</span>;
}

function HistoryButton({ label, open, onToggle, controls }: { label: string; open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      className="pm-hist-btn"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={`${label} history`}
      onClick={onToggle}
    >
      History
    </button>
  );
}

function HistoryList({ id, entries }: { id: string; entries: ParameterHistoryEntry[] }) {
  return (
    <div className="pm-hist" id={id}>
      {entries.length === 0 ? (
        <p className="pm-muted">Nothing is recorded yet.</p>
      ) : (
        entries.map((h) => (
          <div className="pm-h" key={h.id}>
            <b className="num">{formatValue(h.name, h.value)}</b>
            <span>
              {dateWords(h.provenance.recordedAt)}, {h.provenance.recordedBy}
            </span>
            <span>
              {h.provenance.reason}{" "}
              <span className={`pm-prov${h.provenance.kind === "backtest" ? " pm-prov--backtest" : ""}`}>
                {h.provenance.kind === "backtest" ? "Backtest" : "Reviewed Judgment"}
              </span>
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function NumberBox({
  name,
  label,
  unit,
  draft,
  problem,
  onChange,
  onKey,
}: {
  name: ParameterName;
  label: string;
  unit: string;
  draft: string;
  problem: string | undefined;
  onChange: (text: string) => void;
  onKey: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <span className={`pm-num${problem ? " pm-num--bad" : ""}`}>
      <input
        id={`pm-in-${name}`}
        inputMode="decimal"
        value={draft}
        aria-label={label}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `pm-err-${name}` : undefined}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
      />
      <span className="pm-u">{unit}</span>
    </span>
  );
}

function ParameterRow({
  name,
  label,
  sub,
  swatch,
  unit,
  draft,
  problem,
  changed,
  share,
  slider,
  history,
  open,
  onToggle,
  onChange,
  onKey,
}: {
  name: ParameterName;
  label: string;
  sub: string;
  swatch?: ProvenanceKind;
  unit: string;
  draft: string;
  problem: string | undefined;
  changed: boolean;
  share?: number;
  slider?: boolean;
  history: ParameterHistoryEntry[];
  open: boolean;
  onToggle: () => void;
  onChange: (text: string) => void;
  onKey: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const numeric = Number(draft);
  const entries = newestFirst(history.filter((h) => h.name === name));
  return (
    <div className={`pm-row${slider ? "" : " pm-row--plain"}${changed ? " pm-row--changed" : ""}${problem ? " pm-row--bad" : ""}`}>
      <div className="pm-name">
        {swatch ? <span className={`pm-sw pm-k--${swatch}`} /> : null}
        <span>
          {label}
          <span className="pm-sub">{sub}</span>
        </span>
        <span className="pm-dot pm-dot--changed pm-chg" aria-label={changed ? "Changed" : undefined} />
      </div>
      {slider ? (
        <input
          type="range"
          className="pm-slider"
          min={0}
          max={10}
          step={0.5}
          value={Number.isFinite(numeric) ? Math.min(10, Math.max(0, numeric)) : 0}
          aria-label={`${label} weight slider`}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : null}
      <NumberBox name={name} label={`${label} ${slider ? "weight" : "percent"}`} unit={unit} draft={draft} problem={problem} onChange={onChange} onKey={onKey} />
      {slider ? <span className="pm-pct num">{Math.round((share ?? 0) * 100)}%</span> : null}
      <HistoryButton label={label} open={open} onToggle={onToggle} controls={`pm-hist-${name}`} />
      {problem ? (
        <p className="pm-err" id={`pm-err-${name}`}>
          {problem}
        </p>
      ) : null}
      {open ? <HistoryList id={`pm-hist-${name}`} entries={entries} /> : null}
    </div>
  );
}

function TierRow({
  flag,
  label,
  drafts,
  problems,
  changed,
  hit,
  example,
  history,
  open,
  onToggle,
  onChange,
  onKey,
}: {
  flag: ConfidenceFlag;
  label: string;
  drafts: Drafts;
  problems: Partial<Record<ParameterName, string>>;
  changed: ParameterName[];
  hit: boolean;
  example: WorkedExampleView | null;
  history: ParameterHistoryEntry[];
  open: boolean;
  onToggle: () => void;
  onChange: (name: ParameterName, text: string) => void;
  onKey: (name: ParameterName, event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const spreadName = `spread.${flag}` as const;
  const countName = flag === "low" ? null : (`flag.${flag}_min_comparables` as const);
  const names: ParameterName[] = countName ? [countName, spreadName] : [spreadName];
  const isChanged = names.some((n) => changed.includes(n));
  const tierProblems = names.filter((n) => problems[n]).map((n) => ({ name: n, message: problems[n]! }));
  const entries = newestFirst(history.filter((h) => names.includes(h.name)));
  const meter = flag === "low" || !example ? null : example.meters[flag];
  return (
    <div className={`pm-tier${hit ? " pm-tier--hit" : ""}${isChanged ? " pm-tier--changed" : ""}${tierProblems.length ? " pm-tier--bad" : ""}`}>
      <div className="pm-t">
        <span className={`pm-dot pm-dot--${flag}`} />
        {label}
        <span className="pm-dot pm-dot--changed pm-chg" aria-label={isChanged ? "Changed" : undefined} />
      </div>
      {countName ? (
        <label className="pm-field">
          Comparables Needed
          <NumberBox
            name={countName}
            label={`${label} comparables needed`}
            unit="Jobs"
            draft={drafts[countName]}
            problem={problems[countName]}
            onChange={(t) => onChange(countName, t)}
            onKey={(e) => onKey(countName, e)}
          />
        </label>
      ) : (
        <div className="pm-fixed">Anything That Misses Medium</div>
      )}
      <label className="pm-field">
        {flag === "low" ? "Range Width" : "Within and Range Width"}
        <NumberBox
          name={spreadName}
          label={`${label} range width percent`}
          unit="± %"
          draft={drafts[spreadName]}
          problem={problems[spreadName]}
          onChange={(t) => onChange(spreadName, t)}
          onKey={(e) => onKey(spreadName, e)}
        />
      </label>
      <HistoryButton label={label} open={open} onToggle={onToggle} controls={`pm-hist-tier-${flag}`} />
      {meter ? (
        <div className="pm-meter">
          <span>Your Example</span>
          <span className="pm-bar" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (meter.count / Math.max(1, meter.need)) * 100)}%` }} />
          </span>
          <span className="num">
            {meter.count} Jobs, Needs {meter.need}
          </span>
          <span className="num">
            {wholePercent(meter.dispersion)} Off, Allows {wholePercent(meter.allows)}
          </span>
          <span className={`pm-ok${meter.meets ? " pm-ok--yes" : " pm-ok--no"}`}>{meter.meets ? "Meets It" : "Misses It"}</span>
        </div>
      ) : null}
      {tierProblems.map((p) => (
        <p className="pm-err" id={`pm-err-${p.name}`} key={p.name}>
          {p.message}
        </p>
      ))}
      {open ? <HistoryList id={`pm-hist-tier-${flag}`} entries={entries} /> : null}
    </div>
  );
}

function ExampleBody({ example }: { example: WorkedExampleView }) {
  const { blend } = example;
  return (
    <>
      <div className="pm-big">
        <span className="pm-v num">${blend.rate.toFixed(2)}</span>
        <span className="pm-u">Per GSF</span>
        <span className={`chip chip--${blend.confidence}`}>
          <span className="dot" />
          {FLAG_WORDS[blend.confidence]}, ±{wholePercent(blend.spread)}
        </span>
      </div>
      <NumberLine example={example} />
      <p className="pm-why">
        Range ${blend.low.toFixed(2)} to ${blend.high.toFixed(2)}. {example.reason}
      </p>
      <ul className="pm-sig">
        {SOURCES.map((s) => {
          const figure = WORKED_EXAMPLE.find((f) => f.kind === s.kind)!;
          return (
            <li key={s.kind}>
              <span className={`pm-sw pm-sw--round pm-k--${s.kind}`} />
              <span>
                {s.exampleWords}
                {s.kind === "llm_proposal" ? <span className="pm-muted"> (Not a Comparable)</span> : null}
              </span>
              <span className="pm-r num">${figure.rate.toFixed(2)}</span>
              <span className="pm-w num">{Math.round((example.shares[s.kind] ?? 0) * 100)}% of Blend</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

const FLAG_COLOR: Record<ConfidenceFlag, string> = {
  high: "var(--done-bright)",
  medium: "var(--working)",
  low: "var(--stuck-bright)",
};

/**
 * Where each figure sits against the blended rate and its range. A dot grows
 * with its weight; the band is the range in the flag's colour.
 */
function NumberLine({ example }: { example: WorkedExampleView }) {
  const { blend } = example;
  const rates = WORKED_EXAMPLE.map((f) => f.rate);
  const lo = Math.min(...rates, blend.low) - 1;
  const hi = Math.max(...rates, blend.high) + 1;
  const x = (v: number) => 20 + ((v - lo) / (hi - lo)) * 320;
  const maxWeight = Math.max(...blend.comparables.map((c) => c.weight));
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / 2) * 2; v <= hi; v += 2) ticks.push(v);
  return (
    <svg className="pm-plot" viewBox="0 0 360 96" role="img" aria-label="Where each figure sits against the blended rate and its range">
      <rect
        className="pm-band"
        x={x(blend.low)}
        y={14}
        width={x(blend.high) - x(blend.low)}
        height={50}
        rx={6}
        fill={FLAG_COLOR[blend.confidence]}
        fillOpacity={0.14}
      />
      <line x1={20} x2={340} y1={70} y2={70} stroke="var(--border)" />
      {ticks.map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={70} y2={74} stroke="var(--border)" />
          <text x={x(v)} y={88} fontSize={10} textAnchor="middle" fill="var(--ink-3)" className="num">
            ${v}
          </text>
        </g>
      ))}
      {WORKED_EXAMPLE.map((figure, i) => {
        const weight = blend.comparables.find((c) => c.kind === figure.kind)?.weight ?? 0;
        const r = 3 + 6 * Math.sqrt(weight / maxWeight);
        return (
          <circle
            key={figure.kind}
            className={`pm-fig pm-k--${figure.kind}`}
            cx={x(figure.rate)}
            cy={30 + (i % 3) * 10}
            r={r}
            stroke="var(--surface)"
            strokeWidth={1.5}
          >
            <title>{`${SOURCES[i].exampleWords}: $${figure.rate.toFixed(2)}, weight ${formatValue(SOURCES[i].name, weight)}`}</title>
          </circle>
        );
      })}
      <line x1={x(blend.rate)} x2={x(blend.rate)} y1={8} y2={70} stroke="var(--ink)" strokeWidth={2} />
      <text x={x(blend.rate)} y={6} fontSize={10} textAnchor="middle" fill="var(--ink)" fontWeight={700}>
        Blend
      </text>
    </svg>
  );
}
