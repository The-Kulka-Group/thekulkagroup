import type { BranchGateAnswer } from "@kulka/engine";

import type { Db } from "@/lib/db";

// The Scope module's server side (LA-1028): reading a project's own gate
// columns to prefill the module, and checking the answers a ROM request
// sends back with it. The math that turns an answer into a priced, removed,
// or TBD line lives in packages/engine/src/rom-gates.ts; this file only
// moves the answers between the database and the wire.

/**
 * The nine yes/no scope questions the Scope module shows, in the order the
 * module lists them: the five original branch gates (CONTEXT.md), then the
 * four LA-720/LA-1028 narrower ones. Parking is not here: it is not a yes/no
 * gate, it already has its own required question on the tier-1 flow, and it
 * is read from the project record the same way it always has been
 * (lib/rom/run.ts).
 */
export const SCOPE_QUESTIONS: readonly { section: string; label: string; column: string }[] = [
  { section: "demolition", label: "Demolition", column: "demolition_gate" },
  { section: "levels_below_grade", label: "Levels Below Grade", column: "levels_below_grade_gate" },
  {
    section: "existing_building_tie_in",
    label: "Existing Building Tie-in",
    column: "existing_building_tie_in_gate",
  },
  { section: "site_conditions", label: "Site Conditions", column: "site_conditions_gate" },
  { section: "amenity_scope", label: "Amenity Scope", column: "amenity_scope_gate" },
  { section: "elevator", label: "Elevator", column: "elevator_gate" },
  { section: "retail_storefronts", label: "Retail Storefronts", column: "retail_storefronts_gate" },
  { section: "balconies", label: "Balconies", column: "balconies_gate" },
  { section: "radio_amplifier", label: "Emergency Radio Amplifier (BDA)", column: "radio_amplifier_gate" },
];

const GATE_ANSWER_VALUES = new Set<BranchGateAnswer>(["yes", "no", "dont_know"]);

/** One answer per section, absent where nobody has answered it yet. */
export type GateAnswers = Partial<Record<string, BranchGateAnswer>>;

/** What the /rom page needs to prefill the Scope module: the project's own recorded answers. */
export async function readProjectGateAnswers(db: Db, projectId: string): Promise<GateAnswers> {
  const columns = SCOPE_QUESTIONS.map((q) => q.column).join(", ");
  const { rows } = await db.query<Record<string, BranchGateAnswer | null>>(
    `select ${columns} from projects where id = $1`,
    [projectId],
  );
  const row = rows[0];
  if (!row) return {};

  const answers: GateAnswers = {};
  for (const question of SCOPE_QUESTIONS) {
    const value = row[question.column];
    if (value) answers[question.section] = value;
  }
  return answers;
}

/**
 * Writes the Scope module's answers back onto the project record (LA-1109),
 * so the next visit prefills from what was just run. Every section the module
 * shows is set: a section absent from `gates` (nobody answered it in the
 * panel) clears that column, the same "full state, blanks included" contract
 * `parseGateAnswers` already reads off the wire.
 */
export async function saveProjectGateAnswers(db: Db, projectId: string, gates: GateAnswers): Promise<void> {
  const assignments = SCOPE_QUESTIONS.map((q, i) => `${q.column} = $${i + 2}`).join(", ");
  const values = SCOPE_QUESTIONS.map((q) => gates[q.section] ?? null);
  await db.query(`update projects set ${assignments} where id = $1`, [projectId, ...values]);
}

export type ParsedGateAnswers = { ok: true; gates: GateAnswers } | { ok: false; error: string };

/**
 * Checks the Scope module's answers a ROM request carries. Absent means "read
 * the project's own gate columns instead" (lib/rom/run.ts). Present means
 * exactly this set of sections, whatever it is, including an empty object,
 * which means every row was left blank for this run.
 */
export function parseGateAnswers(value: unknown): ParsedGateAnswers {
  if (value === undefined || value === null) return { ok: true, gates: {} };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Send gates as an object keyed by question." };
  }

  const gates: GateAnswers = {};
  for (const [section, answer] of Object.entries(value as Record<string, unknown>)) {
    if (!GATE_ANSWER_VALUES.has(answer as BranchGateAnswer)) {
      return { ok: false, error: `Send gates.${section} as "yes", "no", or "dont_know".` };
    }
    gates[section] = answer as BranchGateAnswer;
  }
  return { ok: true, gates };
}
