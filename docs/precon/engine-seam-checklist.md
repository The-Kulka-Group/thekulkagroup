# Engine-seam checklist, harvested from the old NOVATERRA ROM suite

LA-9 and LA-14 say the old NOVATERRA ROM test suite comes along as a spec checklist:
its cases are the reference for coverage, never for style or code, and no constant
crosses over. This file is that checklist. It was harvested on 2026-09-21 from
`~/dev/NOVATERRA/app` by reading every `it` block in a test file with "rom" in its
name (130 cases in 8 files; the ticket's "128" was an estimate). Each case carries one
verdict:

- **Kept.** The behaviour is the same and an engine-seam test asserts it.
- **Translated.** The idea survives in a different shape, and the note says which test
  holds it now.
- **Rejected.** The behaviour contradicts the spec or belongs to something the spec
  keeps out, and the note says which rule.

Tests named below live in `packages/engine/src/rom.test.ts` unless a path says
otherwise. Where the old case tested a hardcoded table (building-type benchmarks,
multipliers, market factors), the verdict is rejected on LA-9's rule that all cost
knowledge lives in Kulka's database and never in source constants. Where it tested
reading drawings or schedules, the verdict is rejected on the rule that the tool never
claims AI reads construction drawings or performs takeoffs.

## `src/utils/__tests__/romEngine.test.js` (80 cases)

### `getBuildingParamMultipliers` (23)

Every case here exercises a hardcoded multiplier table driven by floor count,
basement count, bathroom count, kitchen and elevator and server-room presence, and
unit count, with a 0.5 floor and a 2.5 cap. All 23 are **rejected**. The spec prices
each canonical work item off its own quantity driver from Kulka's data (LA-720), routes
sections through three-answer branch gates (LA-676, LA-694), and keeps every rate in
the database. There is no multiplier layer to test. The three ideas worth keeping
(elevators scale with stops, plumbing scales with bathroom count, below-grade work is
a gate) already live in `canonical-work-items.md` and `rom-intake.ts` as drivers and
gates, not multipliers.

### `generateBaselineROM` (23)

| Old case | Verdict | Now |
| --- | --- | --- |
| generates ROM for commercial office | Rejected | Project type is `multifamily` or `self_storage` (LA-9). |
| returns zero totals for zero SF | Translated | Zero area is refused, never priced at zero: "refuses a project with no floor area". Silence is never read as zero (rom-spec.md). |
| handles string SF by parsing to float | Rejected | Answers are typed; the API route validates its body. |
| handles invalid SF gracefully | Translated | "refuses a floor area that is not a number". |
| handles unknown building type by falling back to default | Rejected | No fallback type. A snapshot with nothing matching says so: "says so plainly when no benchmark matched". |
| defaults to commercial-office in return object for unknown type | Rejected | Same. |
| includes division-level breakdowns | Translated | Lines are per cost code (canonical work item). Rollups to division, element, and package are ADR 0002, a later ticket. |
| applies work type multiplier (new 4-arg signature) | Rejected | New construction and renovation are a filter, never a multiplier: "never blends renovation data into a new-construction ROM". |
| sets workMultiplier to 1.0 when no work type | Rejected | Same. |
| applies calibration factors (old 3-arg signature) | Translated | Calibration is measured by the backtest (LA-23) and lands as `engine_parameters` rows with `backtest` provenance, not as per-call factors. |
| applies calibration factors (new 4-arg signature) | Translated | Same. |
| calibrated is false when no calibration factors | Translated | Every parameter carries its provenance kind; `rom.parameters` says whether a value is judgment or backtest: "echoes the parameters it computed with, provenance included". |
| applies building param multipliers | Rejected | See `getBuildingParamMultipliers`. |
| buildingParamAdjusted is false with no building params | Rejected | Same. |
| division totals sum approximately to grand total | Kept | "totals the lines it produced", exact, not approximate. |
| per-SF rates are within commercial-office benchmark band | Rejected | No benchmark band in source. |
| healthcare is more expensive than commercial office | Rejected | No building-type tables. |
| retail has fewer divisions than commercial office | Rejected | Same. |
| handles all known building types without error | Rejected | Same. |
| perSF values are rounded to 2 decimal places | Translated | Whole dollars only, cents imply false precision: "rounds every figure to whole dollars". |
| total values are rounded to integers | Kept | Same test. |
| division totals are zero when SF is zero | Translated | Zero area is refused; see above. |
| (signature drift between 3-arg and 4-arg calls) | Rejected | One typed signature, `computeRom(answers, snapshot)`. |

### `computeCalibration` (5)

| Old case | Verdict | Now |
| --- | --- | --- |
| returns empty when romPrediction is null | Translated | LA-23's harness. |
| returns empty when actuals is null | Translated | LA-23. |
| returns empty when romPrediction has no divisions | Translated | LA-23. |
| computes calibration ratio for each division | Translated | LA-23, per line against actual trade cost. |
| skips divisions where predicted mid is zero | Translated | LA-23. |
| skips divisions where actual is zero | Translated | `scoreClosingComparison` already handles a zero actual as an explicit sentinel (`rom-intake.test.ts`). |
| skips divisions missing from actuals | Translated | LA-23. |
| rounds calibration to 2 decimal places | Rejected | A measured parameter is stored as `numeric` with its provenance; rounding is presentation. |

### `extractBuildingParamsFromSchedules` (26)

Every case reads room names, finish schedules, plumbing fixture schedules, and
equipment schedules out of drawings to count bathrooms, kitchens, floors, elevators,
and units. All 26 are **rejected**: the tool never claims AI reads construction
drawings or performs takeoffs (LA-9, CLAUDE.md). Those counts are intake answers a
person gives, or facts the tool derives from other captured facts (elevator stops
from stories), never something extracted from a document.

### `edge cases` (7)

| Old case | Verdict | Now |
| --- | --- | --- |
| generateBaselineROM with both calibration and building params | Rejected | No multipliers. |
| generateBaselineROM with tenant-improvement work type | Rejected | Renovation flows are out of v1 scope (LA-9). |
| parking garage has very high concrete allocation | Rejected | Parking is a required branch gate priced as two benchmarks (LA-682), tested in `rom-intake.test.ts`. |
| restaurant carries elevated plumbing scope | Rejected | No building-type tables. |
| division keys sorted with sortDivisionNames produce CSI numeric order | Translated | "orders lines by cost code whatever order the snapshot arrived in". |
| ROM divisions contain only valid 2-digit CSI codes | Translated | Cost codes are canonical item numbers, enforced at ingestion (`lib/rom/canonical-item-match.test.ts`), not by the engine. |
| ROM totals.mid equals sum of all division mid values | Kept | "totals the lines it produced". |

## `api/discovery/lib/__tests__/romCompute.test.js` (15 cases)

| Old case | Verdict | Now |
| --- | --- | --- |
| applyBaselineMultipliers is a safe identity no-op when no signal is present | Rejected | No multiplier layer. |
| refines numbers via work-type multiplier (gut-renovation = 1.25×) | Rejected | Same. |
| refines per-division via building-type inferred from IBC occupancy | Rejected | Same, and occupancy is not inferred. |
| PRESERVES the computeROM shape exactly | Translated | "keeps the same shape with and without a model's figure in the blend"; "gives a byte-identical ROM whatever order the snapshot's rows arrived in". |
| augmentROMWithAI SUCCESS: applies a Sonnet adjustment and refreshes totals | Translated | A model's figure is a benchmark row of kind `llm_proposal`, blended at the lightest weight: "lets a model's figure move a measured line less than the lightest measured figure would". |
| FAILURE (network throw): returns the pre-augmentation ROM unchanged | Translated | The engine never calls a model. An absent LLM row leaves the line computed from Kulka data alone; the engine needs no LLM weight unless an LLM row is present: "needs a weight only for the kinds that are in the snapshot". |
| FAILURE (no API key): unchanged, no fetch | Translated | Same. |
| FAILURE (HTTP 500): unchanged | Translated | Same. |
| FAILURE (malformed JSON in AI response): unchanged | Translated | Same. |
| clamps a hallucinated order-of-magnitude swing to ±40% of prior mid | Translated | Bounded by weight rather than a clamp: the same test as the success row above. A line resting on a model's figure alone is always low and held: "prices a line resting only on a model's figure, flags it low, holds it, and says so". |
| computeROM returns the exact pre-I.4 contract shape | Translated | Shape test above. |
| baseline layer REFINES the CORE numbers | Rejected | No multiplier layer. |
| AI augmentation success path flows through computeROM end-to-end | Translated | The API seam, `app/api/rom/route.test.ts`: "returns a ranged line with a confidence flag for the test project". |
| AI augmentation FAILURE does not 500 the run | Translated | A missing engine parameter fails the run with a named error and a failed run record, never a silent fallback: `route.test.ts` "fails the run, naming the parameter, when a needed engine parameter is missing". |
| server WORK_TYPE_MULTIPLIER port stays byte-equal to client WORK_TYPES | Translated | Parameters live in one table, so there is no second copy to drift. Data drift is caught by the snapshot hash: `route.test.ts` "changes the snapshot hash when the data behind the ROM changes". |

## `src/stores/__tests__/romStore.test.js` (10 cases)

| Old case | Verdict | Now |
| --- | --- | --- |
| persists the result-relevant slice to localStorage when a result is set | Translated | The run record is the persistence and the audit trail: `route.test.ts` "writes a finished run record holding the ROM and the answers it used". |
| clears the persisted key when the result is reset to null | Rejected | A run record is never cleared. |
| clears the persisted key on explicit reset() | Rejected | Same. |
| does not persist email keystrokes before a result exists | Rejected | No browser store. |
| loadPersistedRom returns null when nothing is stored | Rejected | Same. |
| returns null and clears the key for malformed JSON | Rejected | Same. |
| returns null for a snapshot without a romResult | Rejected | Same. |
| restores a fresh snapshot | Rejected | Same. |
| drops and clears a snapshot older than the 7-day TTL | Translated | Cache staleness became snapshot staleness. A run records the hash of the snapshot it read, so a later reader can tell whether the data behind it has moved: `route.test.ts` "records the snapshot hash on the run, the same for the same data". An issued ROM never expires; it is a frozen version (LA-680). |
| seeds initial state from a fresh persisted snapshot | Rejected | No browser store. |

## `src/__tests__/romSheetProvenance.test.js` (5 cases)

| Old case | Verdict | Now |
| --- | --- | --- |
| compacts a sheetId with a page suffix | Rejected | Drawing-sheet provenance; the tool reads no drawings. |
| strips a bare .pdf when there is no page suffix | Rejected | Same. |
| returns empty for falsy input | Rejected | Same. |
| carries source.sheetId from schedule line items onto scope items | Translated | Provenance flows through to every line, as projects, export, person, and date: "lists every comparable behind a line, heaviest first". |
| leaves sheetId null when the line item has no source sheet | Translated | A judgment or model figure carries a null export label and says so. Same test. |

## `src/utils/__tests__/romVerificationShape.test.js` (6 cases)

| Old case | Verdict | Now |
| --- | --- | --- |
| does NOT flag healthy divisions as zero-cost | Translated | A line is a range and never a point: "returns a ranged line, never a point". |
| still flags a genuinely zero-cost division | Translated | A "no" gate answer prices at zero with high confidence, a separate state from a priced line (`rom-intake.test.ts`, `priceBranchGatedSection`). |
| no longer writes non-existent flat division fields | Rejected | Shape of the old store. |
| re-derives division total from perSF x projectSF | Translated | "scales the line by gross square feet". |
| sums div.total, the field that actually holds the money | Kept | "totals the lines it produced". |
| refuses to publish an all-zero total over non-zero divisions | Translated | Totals are computed from the lines in the same call; there is no second copy to disagree. Same test. |

## `src/utils/__tests__/romToEstimate.test.js` (5 cases)

All five seed a hard-bid estimate from a ROM. **Rejected**: "estimate" belongs to
hard-bid work (CONTEXT.md), and the ROM tool stops at a ROM.

## `api/discovery/lib/__tests__/romFromCore.test.js` (6 cases)

| Old case | Verdict | Now |
| --- | --- | --- |
| returns zero range when no items match | Kept | "says so plainly when no benchmark matched": no lines, zero totals, and an assumption that says why. |
| computes cost range from area-based items (SF unit) | Kept | Every benchmark is dollars per gross square foot; "scales the line by gross square feet". |
| applies regional and inflation multipliers | Rejected | Location factor is pinned at 1.00 in v1 (LA-689). Inflation is a benchmark's recorded date, not a multiplier. |
| sums multiple unit buckets correctly | Rejected | One denominator, gross square feet, so the whole system stays comparable (LA-678). |
| uses schedule-driven quantity for EA bucket on division 8 | Rejected | Reads schedules. |
| handles negative regional multiplier without throwing | Rejected | No multiplier. The engine does refuse nonsense parameters by name: "refuses a weight that is not above zero". |

## `src/components/rom/__tests__/RomAssumptions.test.jsx` (3 cases)

| Old case | Verdict | Now |
| --- | --- | --- |
| shows the scope as adjusted when interpretation succeeded | Translated | Assumptions state what the ROM rests on: "prices a line resting only on a model's figure, flags it low, holds it, and says so"; "states owner-direct scope as its own assumption". |
| discloses an honest caution when the custom scope description couldn't be analyzed | Translated | No free-text scope is interpreted. A "don't know" gate answer shows TBD and the ROM says how many TBD items sit outside it (`rom-intake.test.ts`). |
| stays silent when no custom scope description was provided | Kept | "says nothing about owner-direct scope when there is none". |

## Not harvested

`persistChunksFromScan.test.js`, `extractDrawingsFromDocument.test.js`, and
`discovery/sow/prompts.test.js` matched a filename search for "rom" but belong to the
drawing scanner and the scope-of-work prompt, not the ROM engine. They are out of
scope on the drawings rule and were not counted.

## Tally

130 cases: 9 kept, 39 translated, 82 rejected. The rejections cluster in three
groups, each on one rule: hardcoded multiplier and building-type tables (LA-9, no cost
knowledge in source), reading drawings and schedules (never claim AI reads drawings),
and browser-side caching (the run record is the persistence). What the old suite
protected that still matters, determinism, totals that sum, ranges never points,
provenance on every number, and a model's figure never standing alone, is covered by
the engine and API seam tests named above.
