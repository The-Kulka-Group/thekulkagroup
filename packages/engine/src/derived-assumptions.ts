// LA-860. A derived assumption: a quantity or a spec choice that Jev proposes
// from facts the project already gives, shown on the ROM face as a labeled,
// correctable assumption, the same propose-and-correct pattern rom-spec.md
// uses for duration and GSF per unit.
//
// It is its own record. It is not a stated fact (something the estimator or
// the developer said) and it is not a benchmark cost line (a stored value with
// provenance). The `kind` tag keeps the three apart in types, and the
// derived_assumptions table keeps them apart in storage. Nothing here prices:
// the six trade tickets (LA-774, 775, 776, 777, 781, 784) decide whether and
// how a criterion moves a cost line.
//
// The arithmetic is the engine's, never Jev's. Code computes each candidate's
// steps; Jev only judges which candidate the facts support.

/** Whether an input was stated by someone, or assumed because nobody stated it. */
export type FactBasis = "stated" | "assumed";

/** One fact a derivation used, as it was handed in. */
export type DerivedInput = {
  /** The fact's name as a label, such as "Climate Zone". */
  name: string;
  /** The fact's value as shown, such as "4A". */
  value: string;
  basis: FactBasis;
};

/** What a derivation proposes: a quantity with its unit, or a spec choice in words. */
export type DerivedValue =
  | { kind: "quantity"; amount: number; unit: string }
  | { kind: "spec"; text: string };

/** One row of the arithmetic, ending in the result. */
export type DerivedStep = { label: string; result: string };

/** High shows green, low shows orange, the same two tones as the design. */
export type DerivedConfidence = "high" | "low";

/** The estimator's correction, recorded the same way any other override is: value, reason, who, when. */
export type DerivedCorrection = {
  value: DerivedValue;
  reason: string;
  correctedBy: string;
  /** ISO timestamp. */
  correctedAt: string;
};

export type DerivedAssumption = {
  kind: "derived_assumption";
  /** The criterion code, such as "E-1". */
  code: string;
  /** The criterion's label in title case, such as "Electrical Service Size". */
  label: string;
  /** Jev's value. A correction never overwrites it. */
  value: DerivedValue;
  /** The method line, such as "NEC 220.84 demand load, 60 dwelling units". */
  method: string;
  inputs: DerivedInput[];
  steps: DerivedStep[];
  confidence: DerivedConfidence;
  /** One sentence saying why the confidence is what it is. */
  confidenceReason: string;
  /** The cost codes this criterion feeds. */
  costCodes: string[];
  correction: DerivedCorrection | null;
};

export class InvalidDerivedAssumption extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDerivedAssumption";
  }
}

const blank = (value: unknown) => typeof value !== "string" || value.trim().length === 0;

/** Throws a plain sentence when a value is not a usable quantity or spec. */
export function validateDerivedValue(value: DerivedValue): void {
  if (value.kind === "quantity") {
    if (typeof value.amount !== "number" || !Number.isFinite(value.amount)) {
      throw new InvalidDerivedAssumption("A quantity needs a number.");
    }
    if (blank(value.unit)) throw new InvalidDerivedAssumption("A quantity needs a unit.");
    return;
  }
  if (value.kind === "spec") {
    if (blank(value.text)) throw new InvalidDerivedAssumption("A spec choice needs words.");
    return;
  }
  throw new InvalidDerivedAssumption("A value is either a quantity or a spec choice.");
}

/** Checks a record before it is stored or shown. The rules match the migration's own checks. */
export function validateDerivedAssumption(assumption: DerivedAssumption): void {
  if (blank(assumption.code)) throw new InvalidDerivedAssumption("A derived assumption needs a code.");
  if (blank(assumption.label)) throw new InvalidDerivedAssumption("A derived assumption needs a label.");
  if (blank(assumption.method)) throw new InvalidDerivedAssumption("A derived assumption needs a method.");
  if (assumption.inputs.length === 0) {
    throw new InvalidDerivedAssumption("A derived assumption needs at least one fact it used.");
  }
  for (const input of assumption.inputs) {
    if (blank(input.name) || blank(input.value)) {
      throw new InvalidDerivedAssumption("Every fact needs a name and a value.");
    }
    if (input.basis !== "stated" && input.basis !== "assumed") {
      throw new InvalidDerivedAssumption("Every fact is either stated or assumed.");
    }
  }
  if (assumption.steps.length === 0) {
    throw new InvalidDerivedAssumption("A derived assumption needs its arithmetic.");
  }
  if (assumption.confidence !== "high" && assumption.confidence !== "low") {
    throw new InvalidDerivedAssumption("Confidence is high or low.");
  }
  if (blank(assumption.confidenceReason)) {
    throw new InvalidDerivedAssumption("A derived assumption needs a reason for its confidence.");
  }
  validateDerivedValue(assumption.value);
  if (assumption.correction) validateCorrection(assumption.value, assumption.correction);
}

function validateCorrection(jev: DerivedValue, correction: Pick<DerivedCorrection, "value" | "reason">): void {
  validateDerivedValue(correction.value);
  if (correction.value.kind !== jev.kind) {
    throw new InvalidDerivedAssumption(
      jev.kind === "quantity" ? "Correct a quantity with a number." : "Correct a spec choice with words.",
    );
  }
  if (correction.value.kind === "quantity" && jev.kind === "quantity" && correction.value.unit !== jev.unit) {
    throw new InvalidDerivedAssumption(`Correct this quantity in ${jev.unit}.`);
  }
  if (blank(correction.reason)) throw new InvalidDerivedAssumption("A correction needs a reason.");
}

/** The inputs nobody stated. */
export function assumedInputs(assumption: Pick<DerivedAssumption, "inputs">): DerivedInput[] {
  return assumption.inputs.filter((input) => input.basis === "assumed");
}

/**
 * True whenever any input is assumed. Always derived from the inputs, never
 * stored or set by hand, so it cannot drift from what the derivation used.
 */
export function restsOnAssumedFact(assumption: Pick<DerivedAssumption, "inputs">): boolean {
  return assumedInputs(assumption).length > 0;
}

export function isCorrected(assumption: DerivedAssumption): boolean {
  return assumption.correction !== null;
}

/**
 * Whether the card wears the assumed-fact flag: it rests on an assumed fact
 * and nobody has corrected it yet. Once the estimator sets the value, the
 * assumed input no longer decides it.
 */
export function showsAssumedFact(assumption: DerivedAssumption): boolean {
  return restsOnAssumedFact(assumption) && !isCorrected(assumption);
}

/** The value that counts: the estimator's correction when there is one, otherwise Jev's. */
export function effectiveValue(assumption: DerivedAssumption): DerivedValue {
  return assumption.correction?.value ?? assumption.value;
}

export function sameValue(a: DerivedValue, b: DerivedValue): boolean {
  if (a.kind === "quantity" && b.kind === "quantity") return a.amount === b.amount && a.unit === b.unit;
  if (a.kind === "spec" && b.kind === "spec") return a.text === b.text;
  return false;
}

/** Records a correction. Jev's value stays on the record, so the card can strike it through and revert to it. */
export function applyCorrection(assumption: DerivedAssumption, correction: DerivedCorrection): DerivedAssumption {
  validateCorrection(assumption.value, correction);
  if (blank(correction.correctedBy)) throw new InvalidDerivedAssumption("A correction needs who set it.");
  if (Number.isNaN(Date.parse(correction.correctedAt))) {
    throw new InvalidDerivedAssumption("A correction needs when it was set.");
  }
  return { ...assumption, correction: { ...correction, reason: correction.reason.trim() } };
}

/** Goes back to Jev's value. */
export function revertCorrection(assumption: DerivedAssumption): DerivedAssumption {
  return { ...assumption, correction: null };
}

/**
 * A fact changed and Jev derived the criterion again. Jev's new value and
 * reasoning replace the old ones, and the estimator's correction, when there
 * is one, carries over and keeps winning: a fact change never silently undoes
 * a person's decision.
 */
export function rederive(previous: DerivedAssumption, next: DerivedAssumption): DerivedAssumption {
  if (previous.code !== next.code) {
    throw new InvalidDerivedAssumption(`Cannot carry ${previous.code}'s correction onto ${next.code}.`);
  }
  if (!previous.correction || next.correction) return next;
  if (previous.correction.value.kind !== next.value.kind) return next;
  return { ...next, correction: previous.correction };
}

/** The codes whose shown value differs between two sets, for the shimmer and spring on a fact change. */
export function changedCriteria(
  before: readonly DerivedAssumption[],
  after: readonly DerivedAssumption[],
): string[] {
  const previous = new Map(before.map((one) => [one.code, one]));
  return after
    .filter((one) => {
      const old = previous.get(one.code);
      return old !== undefined && !sameValue(effectiveValue(old), effectiveValue(one));
    })
    .map((one) => one.code);
}

const AMOUNT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** A value as the card shows it: "148 Tons", or the spec's own words. */
export function formatDerivedValue(value: DerivedValue): string {
  return value.kind === "quantity" ? `${AMOUNT.format(value.amount)} ${value.unit}` : value.text;
}
