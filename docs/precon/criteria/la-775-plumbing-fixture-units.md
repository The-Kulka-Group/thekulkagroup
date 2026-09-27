# LA-775: Fixture-Unit Pipe Sizing, Plumbing

Design pass. No code. This proposes how Jev would derive a fixture-unit pipe sizing
quantity for canonical work items 28 (Plumbing Rough-In and Piping) and 29 (Plumbing
Fixtures), MasterFormat Division 22. The source data for these items cites cost code
22.04000 for fixture connections; item 28's rough-in lines carry no single consistent
code across the six source files, so this design cites the item numbers rather than one
code.

## 1. Criterion code and label

**Code:** P-1. **Label:** Fixture-Unit Sizing. **Feeds:** item 28 (Plumbing Rough-In and
Piping) and item 29 (Plumbing Fixtures), both Division 22.

## 2. Facts used

The ticket states that fixture points come from the unit mix and riser count comes from
building count and stories. Checking `config/rom/tier1-flow.json` and
`lib/rom/question-flow.ts` against that claim: none of the four is captured today.
Tier-1 asks project type, construction kind, gross square feet, parking type, and nine
branch gates. It asks nothing about unit mix, bathroom or fixture count, building count,
or stories. `packages/engine/src/rom-intake.ts` uses a unit count only as an input to
the GSF-per-unit proposal function; the flow never stores or asks for it. Unit mix by
bedroom count is named in `rom-spec.md` as belonging to the assumed bucket, but that
bucket is not built (LA-694), so nothing exists to read from it yet.

The ticket's premise does not hold today. No new intake question can be added
(boundary 3), so this design derives every fact from **Gross Square Feet**, the one fact
tier-1 stores, through stated benchmark ratios, each carrying its own assumed
flag:

| Fact | Basis | How it is reached |
| --- | --- | --- |
| Gross Square Feet | stated | Tier-1's `grossSquareFeet` |
| Unit Count | assumed | Gross Square Feet divided by the stored GSF-per-unit benchmark |
| Bathrooms per Unit | assumed | A stated default ratio, needs a number from Matt |
| Bath Fixture Units | assumed | Bathrooms per Unit times a fixed code-table value per fixture |
| Building Count | assumed | Defaulted to 1 until a real value exists anywhere in the schema |
| Riser Count | assumed | Defaulted to 1 per building |

Every one of these rests on an assumed fact, so the card would always carry the
assumed-fact flag (`showsAssumedFact`), independent of Jev's own confidence.

## 3. The DerivationRequest

Fixture-unit sizing itself is arithmetic, not judgment: sum fixture units, convert to a
design flow rate by Hunter's Curve, then look up the pipe diameter in the code's own
table. The engine computes this for each candidate before Jev ever sees it, the same
split `deriveAssumption` already enforces. Jev's one question is which size tier the
mostly-assumed facts support, since the chain above could plausibly land in
more than one tier.

**Question:** "Given these facts, which distribution size tier does this project's
fixture demand support?"

**Candidates:**
- `standard`: value `{ kind: "quantity", amount: 62, unit: "Fixture Units" }`. Method:
  "48 units at 1.5 baths, 2 water-supply fixture units per bath group." Steps:
  1. Unit Count = 45,600 GSF ÷ 950 GSF/unit ≈ 48 units.
  2. Bathrooms = 48 units × 1.5 baths/unit = 72 baths.
  3. Fixture Units = 72 baths × 2 FU/bath group (fixed code-table value, IPC Table
     604.3-style) ≈ 62 FU total after rounding for shared risers.
  4. Design flow by Hunter's Curve: 50 FU ≈ 29 GPM, 62 FU interpolates to roughly
     32-34 GPM (reference points from the published curve: 20 FU = 14 GPM, 50 FU = 29
     GPM, 100 FU = 48 GPM).
  5. The engine looks up the minimum branch and main diameter in the code's own table
     (IPC 610.4 or UPC 610.3, cited by section, not reproduced here) at that flow.
- `elevated`: same steps, a higher bathrooms-per-unit or unit count assumption, landing
  above 100 FU and a larger main.

(All numbers above are a labeled sample for a hypothetical 45,600 GSF, 48-unit building.
No fixture-unit table value or GSF-per-unit ratio here is a proposed benchmark.)

**Reasons:** high, "the assumed unit mix and building scale point clearly to one tier
with little room for the other." low, "the facts are all assumed rather than stated, so
the tiers sit close enough that either could be right."

## 4. Confidence rules

High when Jev's own choice probability clears the shared 0.8 default
(`DEFAULT_HIGH_CONFIDENCE_AT`) and the two tiers are far apart in fixture units. Low
when the tiers sit close, or when the chain of assumed ratios could plausibly swing the
total across the tier boundary. Because every input here is assumed, not stated, the
card always shows the separate assumed-fact flag regardless of this confidence result;
confidence answers only "how sure is the tier pick," not "how sure are the facts."

## 5. Feeding pricing (proposal for Matt)

Today items 28 and 29 price on fixture points and unit count directly; nothing in
`canonical-work-items.md` or `rom-spec.md` ties a benchmark to pipe diameter. Two ways
this could feed pricing, either needing Matt's confirmation:

- **Size-tier multiplier.** The tier Jev picks nudges item 28's or 29's benchmark rate
  up or down a step, the way HVAC system type already forks a benchmark. Needs a stated
  rate from Matt for each tier; none exists in the repo today.
- **New supporting item.** A distribution-sizing line becomes its own item under
  Structure Demolition's pattern (ADR 0006), priced only once Matt states a rate. Needs
  a stated rate from Matt; none exists today.

No dollar figure in this document proposes either.

## 6. Knock-on effects (flagged, not resolved)

- Bathrooms-per-unit and GSF-per-unit are both assumed defaults chained together; an
  error in one compounds into the other before Jev even sees it.
- Which code edition and table applies (IPC, UPC, or a local amendment) is a separate
  jurisdiction question, the same shape LA-771's code-lookup mechanism covers, not this
  one.
- Riser count defaulting to 1 per building undercounts any project with more than one
  building or riser bank, and nothing today records building count to correct it.

## 7. The three boundaries

1. **Output is a quantity and an assumption, never a schematic.** The card shows a
   fixture-unit total and a size tier, not a pipe layout or diameter drawing.
2. **No calculation that needs a fact nobody has.** Every fact above traces to Gross
   Square Feet, the one stated fact, through named, flagged assumptions; nothing is
   invented silently.
3. **No new intake questions.** Unit count, bathrooms per unit, building count, and
   riser count are all reached by assumption from Gross Square Feet, not by asking.

## 8. Open questions for Matt

1. What is the stated default for bathrooms per unit, by product type?
2. Should building count and riser count default to 1 until a real field exists, or
   should this criterion wait until LA-694's assumed bucket stores unit mix?
3. Does a size-tier multiplier or a new supporting item better fit how items 28/29
   should react to fixture demand?
4. What is the stated rate for each size tier, once a mechanism is chosen?

## 9. Build ticket contents

- Add the `deriveAssumption` call for P-1 with the two size-tier candidates and their
  precomputed steps.
- Write the engine functions for GSF-to-unit-count, unit-count-to-bathrooms, and
  bathrooms-to-fixture-units, each a pure function with cited code-table values.
- Wire the assumed-fact chain so every input's `basis` is `"assumed"` until a real field
  exists for it.
- Add the card to the assumptions panel using the shared LA-860 mechanism, no new UI.
- Leave items 28/29 pricing unchanged until Matt picks a pricing mechanism (section 5).
- Write tests against the worked example in section 3, not against a live TypeSafe call.
