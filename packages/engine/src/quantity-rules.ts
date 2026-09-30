// Quantities from the project's facts (LA-1401, spec LA-1394). A General
// Requirements line whose quantity follows from the building, such as final
// cleaning by gross area, fills it in from a named rule. Each rule is a pure
// function of the facts and the schedule, and states its rule and its source
// the way a Design and Engineering criterion does (docs/precon/criteria).
//
// Where a rule needs a fact the project lacks, it says which one and gives no
// number. The line's quantity then stays blank and the plan cannot price it
// until the estimator enters one. A blank quantity never prices as zero or one.
//
// Where the source sheet shows a method (C-00379's Cold Weather Protection and
// Temporary Utilities sections), the rule follows it and records the cell.
// A factor that is neither in Kulka's data nor stated by Matt is a named
// constant marked FOR MATT TO CONFIRM.
//
// The estimator's own quantity always wins, until they reset it
// (app/(app)/rom/resource-plan-form.ts). A saved run keeps the quantities it
// recorded: the engine prices a plan's figures as given and derives nothing.

/** What the rules read. Null where the project has no such fact. */
export type QuantityFacts = {
  /** The project's total gross square feet, garage included (Kulka's single $/SF basis, 2026-09-24). */
  grossSquareFeet: number | null;
  /** Weeks of the construction phase, from the proposed or entered schedule. */
  constructionWeeks: number | null;
  /** The site's perimeter in LF. No question asks for it yet. */
  sitePerimeterLf?: number | null;
  /** The cameras on the plan's own Webcam Cameras line, where it has a quantity. */
  cameraCount?: number | null;
};

export type QuantityRuleId = "gross_area" | "fire_extinguishers" | "barricades" | "camera_service";

/** A derived quantity, or the facts it lacks. */
export type QuantityResult =
  | { ok: true; value: number; words: string }
  | { ok: false; missing: string[]; words: string };

export type QuantityRule = {
  id: QuantityRuleId;
  name: string;
  /** Where the quantity came from: a project fact, or the schedule alone. */
  origin: "fact" | "schedule";
  /** The rate card rows (section and item) whose quantity the rule fills. */
  rows: readonly { section: string; item: string }[];
  /** The rule in one sentence. */
  statement: string;
  /** Where the rule and its figures come from, with the sheet's cells. */
  source: string;
  /** The named constants in the rule that are for Matt to confirm. Empty where none are. */
  forMattToConfirm: readonly string[];
  evaluate: (facts: QuantityFacts) => QuantityResult;
};

const known = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const count = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

function missing(...facts: string[]): QuantityResult {
  const list = facts.map((fact) => fact.toLowerCase());
  const words = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`;
  return { ok: false, missing: facts, words: `Enter a quantity: the project has no ${words}` };
}

// ---- Gross area ---------------------------------------------------------

export const GROSS_AREA_RULE: QuantityRule = {
  id: "gross_area",
  name: "Gross Area",
  origin: "fact",
  rows: [
    { section: "Construction Labor & Clean-up", item: "Final Cleaning" },
    { section: "Temporary & OSHA Protection", item: "OSHA Protection" },
    { section: "Temporary & OSHA Protection", item: "Exterminating" },
    { section: "Temporary & OSHA Protection", item: "Finish Floor Protection" },
  ],
  statement: "The quantity is the project's total gross square feet, garage included.",
  source:
    "Matt, 2026-09-24: every per-area line prices on total gross square feet including garage. C-00379 uses two areas: W44, W96 and W115 carry 120,000 SF, the building footprint (Program Data AC20), and W110 carries the GSF name, 68,016 (Program Data V61), a typed figure nothing on the sheet explains.",
  forMattToConfirm: [],
  evaluate(facts) {
    if (!known(facts.grossSquareFeet)) return missing("Gross Square Feet");
    return { ok: true, value: facts.grossSquareFeet, words: `${count(facts.grossSquareFeet)} SF, the project's gross square feet` };
  },
};

// ---- Fire extinguishers -------------------------------------------------

/** Square feet per extinguisher during construction: C-00379 W211, =GSF/3000. */
export const EXTINGUISHER_SF_EACH = 3000;

export const FIRE_EXTINGUISHER_RULE: QuantityRule = {
  id: "fire_extinguishers",
  name: "Fire Extinguishers",
  origin: "fact",
  rows: [{ section: "Cold Weather Protection", item: "Fire Extinguishers - During Construction" }],
  statement: `One extinguisher per ${count(EXTINGUISHER_SF_EACH)} SF of gross area, not rounded, as the sheet prices it.`,
  source:
    "C-00379 W211, =GSF/3000, which gives 22.672 on its 68,016 GSF. The sheet does not round the count, so neither does the rule. The area is the project's total gross square feet (Matt, 2026-09-24).",
  forMattToConfirm: [],
  evaluate(facts) {
    if (!known(facts.grossSquareFeet)) return missing("Gross Square Feet");
    return {
      ok: true,
      value: facts.grossSquareFeet / EXTINGUISHER_SF_EACH,
      words: `${count(facts.grossSquareFeet)} SF ÷ ${count(EXTINGUISHER_SF_EACH)} SF each`,
    };
  },
};

// ---- Exterior barricades ------------------------------------------------

/**
 * FOR MATT TO CONFIRM. Linear feet of site perimeter per exterior barricade.
 * C-00379 types 30 barricades (W105) and a 1,800 LF site perimeter (Program
 * Data AC15), which imply 60 LF each; the sheet has no formula linking them.
 */
export const BARRICADE_SPACING_LF = 60;

export const BARRICADE_RULE: QuantityRule = {
  id: "barricades",
  name: "Exterior Barricades",
  origin: "fact",
  rows: [{ section: "Temporary & OSHA Protection", item: "Barricades [Exterior]" }],
  statement: `One exterior barricade per ${BARRICADE_SPACING_LF} LF of site perimeter, rounded up.`,
  source:
    "C-00379 types 30 barricades (W105) on a 1,800 LF site perimeter (Program Data AC15). The 60 LF spacing is what those two figures imply, not a formula on the sheet, so it is for Matt to confirm. No New Budget question asks for the site perimeter yet, so the line stays blank until the estimator enters it.",
  forMattToConfirm: ["BARRICADE_SPACING_LF"],
  evaluate(facts) {
    if (!known(facts.sitePerimeterLf)) return missing("Site Perimeter");
    return {
      ok: true,
      value: Math.ceil(facts.sitePerimeterLf / BARRICADE_SPACING_LF),
      words: `${count(facts.sitePerimeterLf)} LF site perimeter ÷ ${BARRICADE_SPACING_LF} LF each`,
    };
  },
};

// ---- Webcam service -----------------------------------------------------

export const CAMERA_SERVICE_RULE: QuantityRule = {
  id: "camera_service",
  name: "Webcam Service",
  origin: "fact",
  rows: [
    { section: "Site Controls", item: "Webcam - Video, Cellular Service" },
    { section: "Site Controls", item: "Webcam - Video, Software" },
  ],
  statement: "One cellular service and one software licence per camera, for the months of construction.",
  source:
    "C-00379 W59 and W60, =W57*months: the camera count (W57) times the construction months. The months come from the line's phases; the count comes from the plan's Webcam Cameras line, which the estimator enters.",
  forMattToConfirm: [],
  evaluate(facts) {
    if (!known(facts.cameraCount)) return missing("Camera Count");
    const n = facts.cameraCount;
    return { ok: true, value: n, words: `One per camera, ${count(n)} ${n === 1 ? "camera" : "cameras"} on this plan` };
  },
};
