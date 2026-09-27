# LA-784: Elevator Type card design

Design pass only, no code. Confirms the LA-860 mechanism (`derived-assumptions.ts`,
`lib/rom/jev.ts`) for the criterion Matt named on 2026-09-20: derive elevator type from
building height, the same propose-and-correct shape already built for duration and GSF
per unit (`rom-spec.md`).

## 1. Card

**Code:** V-1. **Label:** Elevator Type.

**Feeds:** Item 26, Elevators. It picks which of the two cost codes already in the file
applies: **14.02000** (JF, V64: hydraulic, 100 FPM) or **14.21001** (West Shore: traction,
250 FPM). `canonical-work-items.md` already flags this code drift as unexplained; V-1 is
the explanation, not a new fact.

## 2. Facts

- **Stories Above Grade.** The ticket calls this "already a captured field." It is not,
  today. `config/rom/tier1-flow.json` has no stories question; it is only a planned field
  in the schema (`rom-system-design.md:167`) and the working-session packet, tracked as
  intake work still to ship. This is the one real gap between the ticket and the built
  intake. Proposal, keeping the ticket's own boundary against a new question: mark
  Stories Above Grade **assumed**, with a stated default, until the planned tier-1
  question ships. Once that field lands, its answer becomes **stated** and V-1 rederives
  automatically (`rederive`), keeping any estimator correction.
- **Floor-to-Floor Height, typical multifamily.** Assumed, a fixed planning constant,
  not asked. The 10.5 ft in the LA-860 mockup and test records was a sample, not a
  Kulka figure, so this needs a stated value from Matt.
- **Elevator Present.** Stated, from the existing `elevator` branch gate in
  `config/rom/tier1-flow.json`. Confirms V-1 only runs when a project has elevators; it is
  not itself an input to type.

## 3. The DerivationRequest

**Question:** "Which elevator type fits the travel these facts give?"

**Candidates**, both worked on sample projects, neither a real Kulka job:

- `hydraulic`, travel at or under the hydraulic ceiling. Value: spec, "Hydraulic".
  Method: "Travel from Stories Above Grade against the hydraulic ceiling."
  Steps: (1) Stories Above Grade, 4. (2) Floor-to-floor, sample value, 10.5 ft.
  (3) Travel = (4 − 1) × 10.5 ft = 31.5 ft. (4) Hydraulic ceiling (ticket's figure), roughly
  6 stories / 60 ft. (5) 31.5 ft under the ceiling: Hydraulic.
- `traction`, travel past the hydraulic ceiling. Value: spec, "Traction". Method: "Travel
  from Stories Above Grade past the hydraulic ceiling."
  Steps, a 10-story sample: (1) Stories Above Grade, 10. (2) Floor-to-floor, sample value,
  10.5 ft. (3) Travel = (10 − 1) × 10.5 ft = 94.5 ft. (4) Hydraulic ceiling, roughly 6 stories /
  60 ft. (5) 94.5 ft past the ceiling: Traction.

**Reason lines.** High: "Stories Above Grade sits clearly on one side of the hydraulic
ceiling." Low: "Stories Above Grade sits within one story of the ceiling, or rests on an
assumed value rather than a stated one."

## 4. Confidence

High whenever the story count is not near the boundary and Stories Above Grade is stated.
Low whenever either holds: the story count sits at or within one story of the
roughly-five-to-six-story ceiling (the ticket states this as a range, not one number), or
Stories Above Grade is still assumed pending the real intake field. Both conditions
already exist in `restsOnAssumedFact`; the boundary check is new arithmetic in the
candidate steps, not a new mechanism.

One caution for the card: JF (hydraulic, 100 FPM) and West Shore (traction, 250 FPM) are
both described as "6-stop." Story count alone does not cleanly separate them in Kulka's
own two closed jobs; speed is the cleaner signal in hand. This does not block using
stories as the driver, since that is the fact the ROM captures, but it limits how far
"high confidence" should be trusted near the boundary.

## 5. Pricing, proposed

V-1's result should pick which of item 26's two existing per-elevator figures applies,
instead of leaving West Shore's number as an unexplained outlier: $190,000 per elevator
(JF, V64, code 14.02000) for Hydraulic, and $271,858.84 per elevator (West Shore, code
14.21001) for Traction, both already in `canonical-work-items.md` item 26. The
$41,000-per-stop trade number Matt set on 2026-09-18 is one blended rate across both types
today. Whether item 26 should carry two type-specific rates instead, and what those rates
are, needs a stated rate from Matt. This design sets none.

## 6. Knock-on effects, flagged and not resolved

- A Traction result needs a penthouse machine room instead of a small ground-level one, a
  real cost on items 2, 8, and 13, none of which name it as its own line today. V-1 only
  sets the flag; it does not add the cost.
- The 14.02000/14.21001 code drift is explained, not fixed, by this criterion. Any
  downstream code-mapping cleanup is separate work.

## 7. The three boundaries

1. **A type designation and an assumption, never a schematic.** V-1's value is a `spec`
   string, "Hydraulic" or "Traction," the same shape as every other `DerivedAssumption`.
   Nothing about a cab, a rail, or a shaft is produced. Kulka AI does not read drawings or
   perform takeoffs; this criterion states a planning assumption only.
2. **No calculation that needs a fact nobody has.** V-1 uses only Stories Above Grade and
   the fixed floor-to-floor constant. It adds no new required fact; where Stories Above
   Grade is not yet live, it runs on an assumed default rather than blocking.
3. **No new intake questions.** Section 2 marks the missing field assumed instead of
   proposing a question. The card carries the assumed-fact flag until the already-planned
   field ships.

## Decisions, 2026-09-27

Matt answered the open questions below, stated the rates himself, and asked Claude to settle
the rest from the research in `docs/precon/research/la-784-elevator-followups.md`. These
decisions replace the proposals above where they differ. The full reasoning is on LA-784.

1. **Stories Above Grade** is a required multifamily question (LA-1199, shipped). There is
   no default story count; a project without one shows the fact as missing.
2. **The band runs on travel.** Travel = (Stories Above Grade minus 1) times floor-to-floor,
   plus the extra height of a taller ground floor when one is known. 35 ft or less:
   Hydraulic, high confidence. Over 35 ft up to 55 ft: either, low confidence, and V-1
   proposes Hydraulic. Over 55 ft: Traction, high confidence. At 10'-0" floors that is 4
   stories or fewer, 5 and 6, and 7 or more. JF, V64 and West Shore are all 6-stop, inside
   the either zone.
3. **Rates, stated by Matt:** Hydraulic $35,000 per stop. Traction $45,300 per stop. They
   replace the single $41,000 per stop. A flat per-stop rate set at 6 stops runs low at 2 to
   4 stops and high at 8 or more, because elevator cost is a large fixed base plus a
   smaller amount per stop.
4. **Floor-to-floor planning figures:** wood frame, including over a podium, 10'-0"; podium
   level 12'-0"; concrete flat plate 9'-8"; steel 10'-0"; retail or amenity ground floor
   15'-0"; cold-formed steel uses the wood figure until a source turns up. These replace the
   10.5 ft sample used earlier in this document.
5. **The elevator bulkhead is its own canonical item and applies to both types.** Neither
   hydraulic nor machine-room-less traction puts a machine room on the roof, so the
   penthouse machine room assumption in section 6 no longer holds; both need the shaft to
   rise above the roof for the overrun. Default scope: CMU walls around the overrun, a fire
   rating matching the shaft, a hoist beam, the bulkhead's roof and base flashing, and metal
   coping when the roof uses it. The door, frame, hardware and paint go in only when the
   bulkhead also holds the roof stair or a traction machine room, since mechanics reach the
   overrun from the car top. Lights, an outlet, a guardrail, lightning protection and a
   hoistway vent stay out unless a job states them. The bulkhead's rate needs a stated
   figure from Matt.

## 8. Open questions for Matt (answered, see Decisions above)

1. Should Stories Above Grade ship as its own tier-1 question now, ahead of the rest of
   the working-session packet, since V-1 and the elevator-stop count both need it?
2. What default story count should the assumed-fact fallback use before that field ships?
3. Is the hydraulic ceiling exactly 6 stories, matching JF and V64's 6-stop hydraulic
   product, or should it sit lower, given West Shore is also 6-stop but traction?
4. Should item 26 split into two type-specific rates now, and if so, what are they?
5. Should the machine-room cost consequence get its own canonical item, or ride inside the
   Elevators item as a driven variant, as already flagged against items 2, 8, and 13?

## 9. Build ticket contents

- Wire V-1's `DerivationRequest` into the elevator branch, run only when the `elevator`
  gate is yes.
- Read Stories Above Grade as stated once the field ships; assumed default until then.
- Add the boundary check (within one story of the ceiling) to the candidate steps.
- Map V-1's result to the correct cost code on item 26, without a rate split until Matt
  states one or confirms none is needed.
- Reuse the shared derived-assumption card and correction flow from LA-860; no new UI.
- Add the machine-room flag as a visible, unresolved note on a Traction result, not a
  priced line.
- Test cases: low and high stated story counts, a story count at the boundary, and an
  assumed story count, covering both confidence outcomes.
