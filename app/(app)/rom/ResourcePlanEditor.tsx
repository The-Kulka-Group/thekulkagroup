"use client";

import {
  PHASE_LABEL,
  proposedFigure,
  SCHEDULE_PHASES,
  type ConfidenceFlag,
  type PlanBasis,
  type SchedulePhase,
} from "@kulka/engine";

import { titleCase } from "@/lib/format/title-case";
import type { MarkupOptions } from "@/lib/rom/markup";

import { grRateLabel } from "./GrRateCard";
import {
  BASIS_LABEL,
  blankLine,
  CONFIDENCE_LABEL,
  GR_PLAN_GROUPS,
  grRateOptions,
  linesFromGrRate,
  linesFromRateCard,
  originWords,
  PER_LABEL,
  PLAN_GROUPS,
  pricedPlanOf,
  resetPhaseToProposal,
  TYPED,
  type PlanForm,
  type PlanLineForm,
  type ScheduleView,
} from "./resource-plan-form";

// LA-1397: the Allocated Resources plan in Run Settings and New Budget. The
// estimator types the three phases' weeks and builds lines from the rate card
// or their own. Each line is priced by time, by unit or as a lump sum, and
// says where its rate came from. The amounts shown are the engine's, priced
// from the form as it stands.
//
// LA-1398: the same editor builds a General Requirements plan, with the
// General Requirements rate card's sections as its groups. Insurances & Bonds
// is never offered, and a row the card has no rate for is added with its rate
// blank for the estimator to enter.

/** Which rate cards a plan builds from: General Conditions', General Requirements', or both for the combined line. */
export type PlanKind = "gc" | "gr" | "both";

function groupsFor(kind: PlanKind, plan: PlanForm): string[] {
  const listed: string[] =
    kind === "gc" ? [...PLAN_GROUPS] : kind === "gr" ? [...GR_PLAN_GROUPS] : [...PLAN_GROUPS, ...GR_PLAN_GROUPS];
  // A saved line under a group this kind does not list still shows.
  for (const line of plan.lines) if (!listed.includes(line.group)) listed.push(line.group);
  return listed;
}

const DOLLARS = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function ResourcePlanEditor({
  options,
  plan,
  onChange,
  disabled,
  lineName,
  kind = "gc",
  schedule,
}: {
  options: MarkupOptions;
  plan: PlanForm;
  onChange: (plan: PlanForm) => void;
  disabled: boolean;
  /** The markup line the plan prices, such as General Conditions. */
  lineName: string;
  kind?: PlanKind;
  /** The proposed schedule (LA-1399). Absent where no project is chosen yet. */
  schedule?: ScheduleView;
}) {
  const proposal = schedule?.kind === "ready" ? schedule.proposal : null;
  const grSections = new Map(grRateOptions(options.grRates ?? []).map(({ section, rates }) => [section, rates]));
  const priced = pricedPlanOf(plan);
  const amounts = new Map(priced?.lines.map((line) => [line.id, line.amount]) ?? []);
  const setLine = (index: number, patch: Partial<PlanLineForm>) =>
    onChange({ ...plan, lines: plan.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) });
  const setWeeks = (phase: SchedulePhase, value: string) =>
    onChange({ ...plan, weeks: { ...plan.weeks, [phase]: value }, weeksFrom: { ...plan.weeksFrom, [phase]: TYPED } });

  return (
    <div className="plan" aria-label={`${lineName}, Allocated Resources`}>
      <h3 className="t-label markup-sub">Schedule, Weeks</h3>
      <div className="markup-grid">
        {SCHEDULE_PHASES.map((phase) => {
          const proposed = proposal ? proposedFigure(proposal, phase) : null;
          const isProposed = plan.weeksFrom[phase].origin === "proposed";
          const changed = proposed !== null && !isProposed;
          return (
            <div key={phase} className="plan-week">
              <label>
                <span className="field-label t-label">{PHASE_LABEL[phase]}</span>
                <input
                  className="input num"
                  inputMode="decimal"
                  placeholder={proposal && !proposed ? "Enter Weeks" : undefined}
                  value={plan.weeks[phase]}
                  disabled={disabled}
                  onChange={(e) => setWeeks(phase, e.target.value)}
                />
              </label>
              {isProposed ? <span className="plan-week-tag">Proposed</span> : null}
              {changed && proposal ? (
                <button
                  className="btn btn--quiet plan-week-reset"
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(resetPhaseToProposal(plan, phase, proposal))}
                >
                  Reset to {proposed.value} Weeks
                </button>
              ) : null}
            </div>
          );
        })}
        <label>
          <span className="field-label t-label">Range</span>
          <select
            className="input"
            value={plan.confidence}
            disabled={disabled}
            onChange={(e) => onChange({ ...plan, confidence: e.target.value as ConfidenceFlag })}
          >
            {(Object.keys(CONFIDENCE_LABEL) as ConfidenceFlag[]).map((flag) => (
              <option key={flag} value={flag}>
                {CONFIDENCE_LABEL[flag]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {schedule ? <ScheduleProposalNote schedule={schedule} /> : null}
      <p className="markup-note">
        Lines priced by time run over the weeks of the phases they cover. Monthly lines count 30.42 days a month. The
        total carries the engine&rsquo;s range at the confidence picked here.
      </p>

      {groupsFor(kind, plan).map((group) => {
        const rows = plan.lines.map((line, index) => ({ line, index })).filter(({ line }) => line.group === group);
        return (
          <section key={group} className="plan-group" aria-label={group}>
            <h3 className="t-label markup-sub">{group}</h3>
            {rows.length === 0 ? <p className="markup-note">No line added yet.</p> : null}
            <ul className="plan-lines">
              {rows.map(({ line, index }) => (
                <PlanLineRow
                  key={line.id}
                  line={line}
                  amount={amounts.get(line.id)}
                  disabled={disabled}
                  onChange={(patch) => setLine(index, patch)}
                  onRemove={() => onChange({ ...plan, lines: plan.lines.filter((_, i) => i !== index) })}
                />
              ))}
            </ul>
            <div className="plan-adds">
              {group === "Staff" ? (
                <select
                  className="input"
                  value=""
                  disabled={disabled}
                  aria-label="Add a Role From the Rate Card"
                  onChange={(e) => {
                    if (e.target.value) {
                      onChange({ ...plan, lines: [...plan.lines, ...linesFromRateCard("staff", e.target.value, options, plan.lines)] });
                    }
                  }}
                >
                  <option value="">Add a Role&hellip;</option>
                  {options.staffingRates.map((rate) => (
                    <option key={rate.id} value={rate.id}>
                      {rate.role}, {rate.daysPerWeek} Days/Week
                    </option>
                  ))}
                </select>
              ) : group === "Field Office" ? (
                <select
                  className="input"
                  value=""
                  disabled={disabled}
                  aria-label="Add a Field Office Item From the Rate Card"
                  onChange={(e) => {
                    if (e.target.value) {
                      onChange({ ...plan, lines: [...plan.lines, ...linesFromRateCard("office", e.target.value, options, plan.lines)] });
                    }
                  }}
                >
                  <option value="">Add a Field Office Item&hellip;</option>
                  {options.fieldOfficeRates.map((rate) => (
                    <option key={rate.id} value={rate.id}>
                      {titleCase(rate.item)}
                    </option>
                  ))}
                </select>
              ) : grSections.has(group) ? (
                <select
                  className="input"
                  value=""
                  disabled={disabled}
                  aria-label={`Add a ${titleCase(group)} Line From the Rate Card`}
                  onChange={(e) => {
                    if (e.target.value) {
                      onChange({ ...plan, lines: [...plan.lines, ...linesFromGrRate(e.target.value, options.grRates ?? [], plan.lines)] });
                    }
                  }}
                >
                  <option value="">Add From the Rate Card&hellip;</option>
                  {grSections.get(group)!.map((rate) => (
                    <option key={rate.id} value={rate.id}>
                      {titleCase(rate.item)}, {rate.rate !== null && rate.rate > 0 ? titleCase(grRateLabel(rate)) : "No Rate on the Card"}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                className="btn"
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...plan, lines: [...plan.lines, blankLine(plan.lines, group)] })}
              >
                Add Your Own Line
              </button>
            </div>
          </section>
        );
      })}

      <p className="plan-total">
        <span className="t-label">{lineName}</span>{" "}
        <span className="num">{priced ? DOLLARS.format(priced.total) : "Not Priced Yet"}</span>
      </p>
    </div>
  );
}

function PlanLineRow({
  line,
  amount,
  disabled,
  onChange,
  onRemove,
}: {
  line: PlanLineForm;
  amount: number | undefined;
  disabled: boolean;
  onChange: (patch: Partial<PlanLineForm>) => void;
  onRemove: () => void;
}) {
  const togglePhase = (phase: SchedulePhase) =>
    onChange({
      phases: line.phases.includes(phase) ? line.phases.filter((p) => p !== phase) : [...line.phases, phase],
    });
  const rateUnit =
    line.basis === "time" ? PER_LABEL[line.per] : line.basis === "unit" ? `Per ${line.unit.trim() || "Unit"}` : "Lump Sum";

  return (
    <li className="plan-line">
      <div className="plan-line-head">
        <input
          className="input"
          aria-label="Line Name"
          placeholder="Line Name"
          value={line.label}
          disabled={disabled}
          onChange={(e) => onChange({ label: e.target.value })}
        />
        <span className="num plan-amount">{amount === undefined ? "" : DOLLARS.format(amount)}</span>
        <button className="btn btn--redline" type="button" disabled={disabled} onClick={onRemove}>
          Remove
        </button>
      </div>
      <div className="plan-line-fields">
        <label>
          <span className="field-label t-label">Basis</span>
          <select
            className="input"
            value={line.basis}
            disabled={disabled}
            onChange={(e) => onChange({ basis: e.target.value as PlanBasis })}
          >
            {(Object.keys(BASIS_LABEL) as PlanBasis[]).map((basis) => (
              <option key={basis} value={basis}>
                {BASIS_LABEL[basis]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label t-label">Quantity</span>
          <input
            className="input num"
            inputMode="decimal"
            value={line.quantity}
            disabled={disabled}
            onChange={(e) => onChange({ quantity: e.target.value, quantityFrom: TYPED })}
          />
        </label>
        {line.basis === "unit" ? (
          <label>
            <span className="field-label t-label">Unit</span>
            <input
              className="input"
              placeholder="SF"
              value={line.unit}
              disabled={disabled}
              onChange={(e) => onChange({ unit: e.target.value })}
            />
          </label>
        ) : null}
        {line.basis === "time" ? (
          <label>
            <span className="field-label t-label">Rate Is</span>
            <select
              className="input"
              value={line.per}
              disabled={disabled}
              onChange={(e) => onChange({ per: e.target.value as PlanLineForm["per"] })}
            >
              {(Object.keys(PER_LABEL) as PlanLineForm["per"][]).map((per) => (
                <option key={per} value={per}>
                  {PER_LABEL[per]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {line.basis === "time" && line.per === "day" ? (
          <label>
            <span className="field-label t-label">Days/Week</span>
            <input
              className="input num"
              inputMode="decimal"
              value={line.daysPerWeek}
              disabled={disabled}
              onChange={(e) => onChange({ daysPerWeek: e.target.value, daysFrom: TYPED })}
            />
          </label>
        ) : null}
        <label>
          <span className="field-label t-label">Rate, {rateUnit}</span>
          <input
            className="input num"
            inputMode="decimal"
            placeholder={line.noCardRate ? "Enter a Rate" : undefined}
            value={line.rate}
            disabled={disabled}
            onChange={(e) => onChange({ rate: e.target.value, rateFrom: TYPED })}
          />
        </label>
      </div>
      {line.basis === "time" ? (
        <div className="plan-phases" role="group" aria-label="Phases">
          {SCHEDULE_PHASES.map((phase) => (
            <label key={phase} className="plan-phase">
              <input
                type="checkbox"
                checked={line.phases.includes(phase)}
                disabled={disabled}
                onChange={() => togglePhase(phase)}
              />{" "}
              {PHASE_LABEL[phase]}
            </label>
          ))}
          <label className="plan-own-weeks">
            <span className="field-label t-label">Own Weeks</span>
            <input
              className="input num"
              inputMode="decimal"
              placeholder="Phases"
              value={line.weeks}
              disabled={disabled}
              onChange={(e) => onChange({ weeks: e.target.value, weeksFrom: TYPED })}
            />
          </label>
        </div>
      ) : null}
      <p className="markup-note markup-note--inline">
        {line.noCardRate && line.rate.trim() === ""
          ? "The rate card has no rate for this line, so enter one. "
          : `Rate from ${originWords(line.rateFrom)}. `}
        Quantity from {originWords(line.quantityFrom)}.
      </p>
    </li>
  );
}

const PROPOSAL_DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * LA-1399: the proposed schedule, labeled a planning assumption the way the
 * Design and Engineering facts are, with the completed jobs it compared and
 * why. It names no model and claims nothing about drawings: the comparison
 * reads only the project's stated facts and Kulka's recorded jobs.
 */
export function ScheduleProposalNote({ schedule }: { schedule: ScheduleView }) {
  if (schedule.kind === "pending") {
    return (
      <p className="markup-note plan-proposal" role="status">
        Comparing this project with Kulka&rsquo;s completed jobs to propose the weeks&hellip;
      </p>
    );
  }
  if (schedule.kind === "failed") {
    return (
      <p className="markup-note plan-proposal" role="status">
        {schedule.error}
      </p>
    );
  }
  const { proposal } = schedule;
  if (proposal.status !== "proposed") {
    return (
      <p className="markup-note plan-proposal" role="status">
        {proposal.reasoning}
      </p>
    );
  }
  return (
    <section className="plan-proposal" aria-label="Proposed Schedule">
      <h4 className="t-label">Proposed Schedule, a Planning Assumption</h4>
      <p className="markup-note markup-note--inline">
        Proposed on {PROPOSAL_DATE.format(new Date(`${proposal.proposedAt}T00:00:00Z`))} by comparing this
        project&rsquo;s stated facts with Kulka&rsquo;s completed jobs. It is not a schedule. Change any phase and every
        line priced on it follows. {proposal.reasoning}
      </p>
      <ul className="plan-proposal-list">
        {SCHEDULE_PHASES.map((phase) => (
          <li key={phase}>
            <span className="t-label">{PHASE_LABEL[phase]}</span>{" "}
            {proposal.phases[phase].weeks === null ? "Left for you." : `${proposal.phases[phase].weeks} weeks.`}{" "}
            {proposal.phases[phase].reason}
          </li>
        ))}
      </ul>
      <h4 className="t-label">Jobs Compared</h4>
      <ul className="plan-proposal-list">
        {proposal.jobs.map((job) => (
          <li key={job.jobNumber}>
            <span className="num">{job.jobNumber}</span>, {job.name}. {job.why}
          </li>
        ))}
      </ul>
    </section>
  );
}
