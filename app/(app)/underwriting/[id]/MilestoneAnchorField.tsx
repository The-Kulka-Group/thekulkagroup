"use client";

import {
  MAX_ANCHOR_OFFSET_MONTHS,
  MAX_MODEL_YEAR,
  MIN_MODEL_YEAR,
  anchorPreview,
  type Milestone,
  type MilestoneAnchor,
  type MilestoneEndAnchor,
} from "@kulka/engine";

const DURATION = "__duration";

/**
 * One month the user can type, or anchor to a milestone plus an offset. With `allowDuration` the
 * month can also end a set number of months after its line starts. The saved month stays in
 * `month`, so choosing Typed Month again keeps the last resolved month.
 */
export function MilestoneAnchorField({
  id,
  label,
  month,
  onMonthChange,
  anchor,
  onAnchorChange,
  milestones,
  allowDuration = false,
  typedLabel,
  errors = [],
}: {
  id: string;
  label: string;
  month: string;
  onMonthChange: (month: string) => void;
  anchor: MilestoneEndAnchor | undefined;
  onAnchorChange: (anchor: MilestoneEndAnchor | undefined) => void;
  milestones: Milestone[];
  allowDuration?: boolean;
  /** Accessible name of the typed month input. Defaults to the label followed by "month". */
  typedLabel?: string;
  errors?: Array<string | undefined>;
}) {
  const error = errors.find((item) => item !== undefined);
  const errorId = `${id}-error`;
  const duration = anchor && "durationMonths" in anchor ? anchor : undefined;
  const milestoneAnchor = anchor && "milestoneId" in anchor ? anchor : undefined;
  const selected = duration ? DURATION : milestoneAnchor?.milestoneId ?? "";
  const known = milestoneAnchor ? milestones.some((milestone) => milestone.id === milestoneAnchor.milestoneId) : true;
  const preview = milestoneAnchor ? anchorPreview(milestones, milestoneAnchor) : null;
  const describedBy = error ? errorId : undefined;

  function choose(value: string) {
    if (value === "") onAnchorChange(undefined);
    else if (value === DURATION) onAnchorChange({ durationMonths: 12 });
    else onAnchorChange({ milestoneId: value, offsetMonths: milestoneAnchor?.offsetMonths ?? 0 });
  }

  return (
    <div className="underwriting-anchor-field">
      <select id={`${id}-source`} className="input" aria-label={`${label} source`} value={selected}
        aria-invalid={Boolean(error)} aria-describedby={describedBy}
        onChange={(event) => choose(event.target.value)}>
        <option value="">Typed Month</option>
        {milestones.map((milestone) => <option value={milestone.id} key={milestone.id}>{milestone.name || "Unnamed Milestone"}</option>)}
        {milestoneAnchor && !known ? <option value={milestoneAnchor.milestoneId}>Missing Milestone</option> : null}
        {allowDuration ? <option value={DURATION}>Months After Start</option> : null}
      </select>
      {duration ? (
        <input id={id} className="input num right" type="number" min="1" max={MAX_ANCHOR_OFFSET_MONTHS} step="1"
          aria-label={`${label} duration in months`} aria-invalid={Boolean(error)} aria-describedby={describedBy}
          value={Number.isFinite(duration.durationMonths) ? duration.durationMonths : ""}
          onChange={(event) => onAnchorChange({ durationMonths: Number(event.target.value) })} />
      ) : milestoneAnchor ? (
        <>
          <input id={id} className="input num right" type="number" min={-MAX_ANCHOR_OFFSET_MONTHS} max={MAX_ANCHOR_OFFSET_MONTHS} step="1"
            aria-label={`${label} offset in months`} aria-invalid={Boolean(error)} aria-describedby={describedBy}
            value={Number.isFinite(milestoneAnchor.offsetMonths) ? milestoneAnchor.offsetMonths : ""}
            onChange={(event) => onAnchorChange({ milestoneId: milestoneAnchor.milestoneId, offsetMonths: Number(event.target.value) } satisfies MilestoneAnchor)} />
          <span className="t-meta">{preview ? `Months From, ${preview}` : "Months From, No Month Yet"}</span>
        </>
      ) : (
        <input id={id} className="input" type="month" min={`${MIN_MODEL_YEAR}-01`} max={`${MAX_MODEL_YEAR}-12`}
          aria-label={typedLabel ?? `${label} month`} aria-invalid={Boolean(error)} aria-describedby={describedBy}
          value={month} onChange={(event) => onMonthChange(event.target.value)} />
      )}
      {duration ? <span className="t-meta">Months, Counting the Start Month</span> : null}
      {error ? <span id={errorId} className="input-error" role="alert">{error}</span> : null}
    </div>
  );
}
