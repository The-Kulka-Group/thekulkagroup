# Underwriting Build Order After Four Model Audits

Linear: LA-1685.

This file merges the gaps from four audited workbooks into one build order for `packages/engine`. Each audit sits in its own folder:

| Audit | Folder | What the workbook is |
|---|---|---|
| Apartment Development Model v2.98 | `./README.md` | Public sample model; its gaps drove LA-165 to LA-170 |
| Benjamin | `./benjamin/` | A developer's in-house template, run on a high-rise rental deal with ground-floor commercial |
| 214 W Main JLL | `./jll-214-w-main/` | The same template, cut down into a construction loan request for JLL |
| Graybarn Patchogue | `./graybarn/` | A sponsor's ten-sheet lender model for a Long Island apartment deal under an IDA PILOT |

The three new audits keep their deal figures and golden values out of the repo, in Dropbox at `BLDG/BLDG Labs/DEVELOPMENT/LA-1685 Model Audit/`. The repo files hold structure, formulas, cell references, risks and gaps.

## Where The Engine Stands

The monthly core from LA-165 already matches several conventions that both lender models use. It funds equity first, charges interest on the opening balance, pays interest from lease-up cash before capitalizing the rest, and prices the sale on forward twelve-month NOI. It also solves the debt share inside the engine, where the template pastes macro plugs. Every run keeps its inputs, formula version and reconciliations, which none of the workbooks does.

## Gaps Across The Models

| Gap | v2.98 | Benjamin | 214 W Main | Graybarn |
|---|---|---|---|---|
| Lender tests: as-stabilized value, LTV, DSCR, debt yield | | Perm loan only | Yes | Yes |
| Property tax schedule with PILOT or abatement, abated and unabated NOI | Mill rate | Tax method | Yes | Yes |
| Dated floating rate: SOFR curve plus spread | | | Yes | Yes |
| Affordability tier and AMI level on unit types | | Yes | Yes | Yes |
| Other sources: grants, soft loans, credited land | | Yes | Yes | Credited land |
| Loan sizing modes: LTC, cost to complete, lesser of tests | LTV or LTC | LTC on plug | LTC on plug | Cost to complete |
| Cost lines priced per GSF, per unit or percent of a base | | Yes | Yes | |
| Fee and contingency as a percent of total cost, solved in the engine | Yes | Yes | Yes | |
| Milestones, curve anchors, seasonal lease-up, growth by category | | Yes | Yes | Monthly absorption |
| Peak equity, LP and GP waterfall | Yes | Yes | Removed | |
| Commercial or retail tenants | Yes | Yes | Yes | One space |
| Permanent debt and refinance | Yes | Yes | Broken | Yes |

## Recommended Order

Each step is one Linear issue and one pull request. The bracket gives the model and effort level for the step.

1. **Golden adapter harness.** `[Sonnet 5.5 - Medium]` Map each audited deal into current engine inputs and score the engine against the golden values. The test reads fixtures from a path outside the repo and skips when the path is missing, so CI stays green and no deal figure enters git. This step changes no engine code, and it tells us what the engine already meets.
2. **Lender tests.** `[Sonnet 5.5 - Medium]` Report as-stabilized value at a stated date, LTV, DSCR on stated debt service, debt yield, and LTC, each with a formula trace. These read results the engine already makes.
3. **Property tax schedule.** `[Opus 5.5 - High]` Add a dated tax line that can follow a PILOT: base and improvement assessed value, exemption steps, a rate path and the tax fiscal year. Report NOI, value and every lender test with abated tax and with full tax. Check units on millage and assessment ratio, so the template's offsetting-unit error cannot happen.
4. **Dated rate path.** `[Sonnet 5.5 - Medium]` Let the construction loan take a monthly rate schedule with a spread, a curve source and an as-of date, in place of one fixed rate.
5. **Affordability tiers.** `[Sonnet 5.5 - Medium]` Add an affordability tier and AMI level to unit types, and report units, rent and NOI by tier.
6. **Other sources and credited land.** `[Sonnet 5.5 - High]` Add grants and soft loans with timing, plus credited land value kept apart from cash land cost. Report LTC on both bases and tie every source to the sources and uses summary. This closes the 214 W Main grant defect and the Graybarn credited-land defect.
   Built in LA-1813. Limits: a soft loan repays in one month inside the model timeline, so a loan a buyer assumes at sale, or one repaid after the sale, is not modeled. Soft loan interest accrues to the loan and is paid at repayment, so it stays out of total uses and out of yield on cost.
7. **Cost line basis types.** `[Sonnet 5.5 - Medium]` Let a cost line carry per GSF, per unit or percent of another line, and keep the derived amount separate.
   Built in LA-1819 as an engine change. A line takes a `basis` (fixed, per gross square foot, per unit, or percent of another line), and the engine derives the amount from the rate and the case quantities. Limits: a case does not save a basis yet, because that needs a migration, case quantities and the editor, so the save route rejects basis lines. Step 8 can already read derived amounts from the engine.
8. **Percent-of-total solve and loan sizing modes.** `[Opus 5.5 - High]` Solve the development fee, contingency and loan fee against total cost in the engine, with an iteration cap and a check. Add loan sizing by LTC, by cost to complete, and by the lesser of the lender tests. This depends on steps 2 and 7.
9. **Milestones, seasonal lease-up and growth by category.** `[Sonnet 5.5 - High]` Add named milestones and curve anchors, twelve monthly absorption factors with a stabilization test, and separate growth rates for rent, other income, expenses and taxes.
10. **Peak equity and partnership waterfall.** `[Opus 5.5 - High]` Report peak equity with its month, then add LP and GP funding, preferred return and IRR hurdle tiers on top of reconciled levered cash flow.
11. **Commercial, permanent debt and the annual view.** Scope these after step 10. The spec already names them as later modules.

Steps 2 to 5 come first because both lender models need them and the engine can add them without new structure. Steps 7 and 8 rework the cost model, so they come after the lender view exists to check against.

## Workbook Defects Worth Telling The Deal Teams

The audits found errors in the deals themselves. These matter beyond Kulka, and each audit README names the cells.

- **Benjamin** drops vacancy from the sale NOI at `Dispo Value!O117`, which overstates the sale value and every return.
- **214 W Main** funds a state grant in the cash flow that the equity formula and the Sources & Uses tab leave out. Its levered IRR is a value pasted by an earlier macro run, because the IRR formulas were deleted.
- **Graybarn** values the deal and runs every lender test on year-one PILOT tax, the lowest in the schedule. Its printed LTC counts a land step-up as equity.

## Rules That Carry Forward

- Do not match a workbook number that comes from a defect. The golden files stage those tests to stay red on purpose.
- Never paste a plug or write test values into inputs. Solve loops in the engine and run scenarios on copies.
- Keep deal figures out of the repo.
- Keep formulas in the engine, and keep source labels, review states, formula versions and immutable runs.
