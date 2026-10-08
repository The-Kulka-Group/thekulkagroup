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
   Built in LA-1819 as an engine change. A line takes a `basis` (fixed, per gross square foot, per unit, or percent of another line), and the engine derives the amount from the rate and the case quantities. A case saves a basis in LA-1820, with gross area and units read from the project facts. A change to those facts changes every derived amount on the next run. Step 8 can read derived amounts from the engine.
8. **Percent-of-total solve and loan sizing modes.** `[Opus 5.5 - High]` Solve the development fee, contingency and loan fee against total cost in the engine, with an iteration cap and a check. Add loan sizing by LTC, by cost to complete, and by the lesser of the lender tests. This depends on steps 2 and 7.
   Part one built in LA-1822. A line can be a percent of Total Cost, Total Less Land, or Hard and Soft Cost, chosen per line. The base leaves the line itself out and takes in every other line in it, so there is no self-reference. The two total bases include financing, which the capital plan feeds back until it moves by no more than a cent, within 100 rounds. Each line has a reconciliation check against its settled base. A cost-only or operations-only run has no financing yet and says so in the line's trace. Part two, lesser-of loan sizing, is LA-1823. Cost to complete is not a separate mode, because equity-first funding already gives it.
   Part two built in LA-1823. The lender tests can carry loan sizing: a maximum LTV, a minimum debt yield, and a minimum DSCR at a stated rate and amortization, each optional. Every NOI cap reads the lender-test valuation year, taxed on full or abated tax as the case chooses (full tax by default). The valuation-year NOI does not depend on the loan, so the smallest NOI cap becomes a ceiling on total debt and the capital plan funds again under it. The loan is the lesser of that ceiling and LTC on total cost. The run reports every cap, marks the one that binds, and checks that total debt equals it. The loan fee is charged on the capped loan when a cap binds. Each scenario sizes its own loan on its own NOI.
9. **Milestones and growth by category.** Seasonal lease-up and the stabilization test shipped in LA-1704, and lease turnover in LA-1784. Growth by category shipped in LA-1838: separate yearly rates for market rent, affordable rent, other income and operating expenses, with the last rate carrying forward. Named milestones and cost curve anchors shipped in LA-1839: a case holds named milestones, and a cost line, the sale month, the operation start and the growth start can each point to a milestone plus an offset in months (a line end can also be a duration). The engine resolves every anchor before the run and the run saves both the anchor and the month. Front-loaded and back-loaded joined the straight-line and S-curve shapes. Capital plan dates, other-source draw months and tax fiscal years stay typed, except that debt payoff follows an anchored sale month because the engine already requires them to match.
   Occupancy cap added in LA-1849, after the capitalized interest investigation. An optional block makes leased units stop at one less the vacancy percent of revenue units, with no vacancy loss on top, the way Benjamin and 214 W Main treat vacancy. A case without it runs as before. On Benjamin it cut the capitalized interest gap from +10.25 percent to +2.59 percent, and on 214 W Main from +11.07 percent to +8.60 percent.
10. **Peak equity and partnership waterfall.** `[Opus 5.5 - High]` Report peak equity with its month, then add LP and GP funding, preferred return and IRR hurdle tiers on top of reconciled levered cash flow.
    Built in LA-1863. Every property run reports peak equity: the largest running total of negative levered cash flow less positive, with the first month it is reached. An optional partnership block on the sale plan splits the run's levered cash flow between an LP and a GP. Contributions split pari passu or GP first by the LP funding share, and with an LP entry month the GP funds alone until the LP pays it a catch-up. Distributable cash pays an optional preferred return and then capital, then up to six LP IRR hurdle tiers, each with a GP promote and an LP base share for the rest, then a final split. The preferred return compounds monthly to the annual rate on capital plus unpaid return, as Benjamin does, or accrues simply on capital. Hurdles are LP IRR lookback accounts at the monthly rate that compounds to the stated rate. A month that needs more cash than the capital plan's equity becomes a cash call, funded under the funding order. The run reports LP and GP contributions, distributions, net profit, XIRR, equity multiple, peak equity, preferred return and the promote, each with a formula trace, and checks every month that LP plus GP cash equals levered cash flow and that contributions equal the capital plan's equity. Replayed on each workbook's own cash flow, the waterfall matches the v2.98 LP and GP XIRR to six decimal places and every Benjamin LP and GP figure within 0.01 percent, or 0.02 percent for the IRRs, which the workbook annualizes from a monthly IRR. The block saves inside the sale plan, so there is no migration.
    Limits: there is no GP catch-up of the promote, because no audited deal uses one (the v2.98 flag is off in effect); no separate preferred return start date for each partner; no asset management or other partnership fee, which v2.98 pays the GP before its waterfall; and no second promote between co-GPs. The preferred return is paid pro rata to what each partner is owed, where Benjamin weights by each partner's capital plus return, which moves its accrued return by under 0.01 percent. Scenario comparisons run the waterfall but show no LP and GP columns yet.
11. **Commercial, permanent debt and the annual view.** Scope these after step 10. The spec already names them as later modules. The scope and Matt's seven decisions are in `step-11-scope.md`.
    11a built in LA-1867. A case can carry a permanent loan on the capital plan. It funds in a typed month, the first stabilized month plus an offset, or a milestone plus an offset, and the construction loan repays that month in place of the sale month. The loan sizes on the construction balance or on the lesser of LTV, DSCR and debt yield caps, read from annualized trailing NOI or the twelve months from funding, on full or abated tax. The caps share one formula with the LA-1823 construction caps. Proceeds above the payoff go to the equity holders, or the loan is cut back to payoff; a shortfall is an equity paydown on its own line. After funding, interest runs monthly on the opening balance, then a level payment once the interest-only months end. Operating cash pays debt service, a month it cannot cover is an equity call, and the sale repays the balance. Levered cash flow carries the proceeds, costs, debt service and payoff, so the LA-1863 waterfall receives cash-out and cash calls with no change of its own. Lender DSCR reads the loan's computed debt service, twelve level payments, with the stated figure kept as an override. The run checks the monthly roll-forward and interest, that proceeds equal the payoff plus costs and cash-out less any paydown, that the sale repays the closing balance, and that the sale falls on or before maturity. Each scenario sizes its own loan. Sizing reads total NOI, so a commercial space from LA-1868 raises the sizing NOI by its own NOI, which a seam test checks. Runs without the block match the results from before to the byte, which a digest test proves. Graybarn's scorecard now funds its permanent loan at take-out and holds to the year-10 sale. On the workbook's own loan amount, a replay matches its interest-only and amortizing debt service and its five interest-only balances; its amortizing balances stay red, because the workbook charges a year of interest on the opening balance. In the full run every permanent loan figure sits 4.58 percent low, the same gap as the engine's construction loan.
    Limits: there is no prepayment penalty or defeasance at sale, no floating permanent rate (the dated rate path stays on the construction loan), no second refinance and no mezzanine. Sizing reads NOI before reserves. Refinance fees and closing costs come out of proceeds and stay out of development cost. The scorecard reports balances for the first ten loan years. A case cannot save the block yet; that is LA-1869 (11b).

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
