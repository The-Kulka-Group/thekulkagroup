# Step 11 Scope: Commercial, Permanent Debt and the Annual View

## Decisions

Matt accepted these seven on 2026-10-07. They answer the questions in "Decisions Only Matt Can Make" at the end of this file.

1. The annual view is a report over monthly results.
2. The default year basis is operating years from the first stabilized month, with the development period as one leading column.
3. The permanent loan sizes on annualized trailing NOI by default, with the month count stated on the case.
4. Excess permanent proceeds go to the partners, or the loan is cut to payoff, as each case chooses. A shortfall is an equity paydown on its own line.
5. First-generation TI and leasing commissions are development cost and count in LTC.
6. Commercial vacancy and credit loss stay separate from residential.
7. With a permanent loan, lender DSCR reads the computed debt service, and the stated figure stays as an override.

Build order: `docs/underwriting-model-audit/build-order.md`, step 11. Read against origin/main at `86dc8d8` (LA-1863 merged). The repo has no open pull requests.

Step 11 splits into six issues: two in a debt lane, three in a commercial lane, and one closing issue. Each issue is one pull request. The permanent debt lane and the commercial lane touch different engine files, so they can run side by side. The annual view comes last because it rolls up both.

| # | Issue | Lane | Depends on | Tier |
|---|---|---|---|---|
| 11a | Take out the construction loan with a permanent loan | Debt | none | `[Opus 5.5 - High]` |
| 11b | Save a permanent loan on a case and show it | Debt | 11a | `[Sonnet 5.5 - Medium]` |
| 11c | Add commercial spaces to operations | Commercial | none | `[Sonnet 5.5 - High]` |
| 11d | Price the sale and lender value with a cap rate per use | Commercial | 11c, and 11a merged first | `[Sonnet 5.5 - Medium]` |
| 11e | Save commercial spaces on a case and show them | Commercial | 11c, 11d | `[Sonnet 5.5 - Medium]` |
| 11f | Roll monthly results into an annual cash flow view | Both | 11b, 11e | `[Sonnet 5.5 - Medium]` |

Mezzanine debt stays out of step 11. Only the v2.98 sample has it, and the coverage matrix ranks it P2.

## What The Audits Give Us To Score Against

The golden values for the permanent loan are thin, so most of 11a must be proved with hand-built tests.

- **Permanent debt.** Graybarn is the only deal with a live permanent loan: a takeout at stabilization on a quote, interest only then amortizing, with a loan amount, rate, annual debt service and DSCR in `Stab NOI Statement`. Benjamin's permanent loan module is off in the saved file, so `Input!T670` and `T671` give the sizing formulas (DSCR through a debt constant on annualized trailing NOI, and LTV on capitalized NOI) but no values. 214 W Main's permanent loan block reads a `#REF!` cell, so every size saves as zero. The v2.98 sample offers permanent debt sized by LTV or by the construction balance, but `golden-tests.json` holds no permanent loan values.
- **Commercial.** Benjamin runs up to twenty tenants with NNN rent, CAM and tax recoveries, free rent, TI, leasing commissions and a commercial exit cap. Its golden file holds commercial NOI (`Proforma!O176`), CAM reimbursement (`O163`), the TI total (`Input!S585`) and commercial gross sale value (`Dispo Value!P188`). Graybarn has one in-line space priced per square foot (`Summary Sheet!K68`) with a tax recovery line. The v2.98 retail line saves as zero (`Underwriting!I111`), which a case with no commercial space must still match. 214 W Main carries the template's commercial module with zero area, so it has nothing to score. The build-order coverage table marks 214 W Main "Yes" for commercial; that reflects the template, not the deal.
- **Annual view.** Benjamin's `10-Year CF!K76` gives a year-one NOI. The v2.98 `Annual Cash Flow` sheet sums monthly lines by year, and the existing `hard-cost-monthly-sum` golden test already reads it. Graybarn's `5 Year NOI Stmt` gives ten years of NOI, debt service, DSCR and debt yield.

## 11a. Take Out the Construction Loan With a Permanent Loan

`[Opus 5.5 - High]` This changes how debt pays off, how levered cash flow is built and what the waterfall receives. A wrong answer here would move every levered return without failing a check, so it needs High.

**What it adds and why.** Today the construction loan must pay off in the final model month, which is the sale month (`payoff_before_final_month` in `development-capital.ts` and `sale_payoff_mismatch` in `property-returns.ts`). Graybarn's lender package takes the construction loan out at stabilization with a permanent loan and holds to a later sale. Benjamin and the v2.98 sample offer the same structure. This issue adds an optional permanent loan block. When the block is present, the construction loan pays off in the takeout month, the permanent loan funds that month, debt service runs monthly from operating cash, and the permanent balance pays off at sale. When the block is absent, every run matches today's results.

**Input shape.**

```ts
export const PERMANENT_LOAN_INPUT_VERSION = "permanent_loan_inputs.v1" as const;

export type PermanentLoanSizingMode =
  | "lesser_of_tests"        // smallest of the caps below
  | "construction_balance";  // v2.98 option: proceeds equal the construction payoff

export type PermanentLoanPlan = {
  permanentLoanInputVersion: typeof PERMANENT_LOAN_INPUT_VERSION;
  /** A typed month, or the first stabilized month plus an offset (Benjamin Input!T685). */
  fundingMonth?: string;
  fundingAnchor?: { kind: "stabilization"; offsetMonths: number } | MilestoneAnchor;
  sizingMode: PermanentLoanSizingMode;
  /** The NOI the caps read: an annualized trailing window or the forward twelve months from funding. */
  sizingNoiWindow: { kind: "trailing"; months: number } | { kind: "forward_twelve" };
  noiTaxBasis: "full_tax" | "abated";
  maxLoanToValuePercent?: number;
  valuationCapRatePercent?: number;   // required with an LTV cap
  minDebtServiceCoverage?: number;
  minDebtYieldPercent?: number;
  annualRatePercent: number;
  interestOnlyMonths: number;
  amortizationYears: number;          // zero is interest only for the whole term
  termYears: number;                  // the sale must fall on or before maturity
  feePercent: number;                 // of loan amount, paid from proceeds
  closingCosts: number;               // fixed, paid from proceeds
  /** Proceeds above the construction payoff and costs go to the equity holders, or are cut back to payoff. */
  cashOut: "distribute" | "limit_to_payoff";
  evidence: Record<PermanentLoanAssumptionKey, DevelopmentCapitalEvidence>;
};
```

It sits on `DevelopmentCapitalPlan` as `permanentLoan?: PermanentLoanPlan`, beside `otherSources` and `creditedLand`.

**Where it plugs in.**

- **Sizing.** The NOI caps reuse the LA-1823 math in `lender-tests.ts`. Pull the cap arithmetic out of `loanSizingCeiling` into a helper that takes an NOI window, a tax basis and the caps, and call it twice: once for the construction loan valuation year, once for the permanent loan window. `annualDebtConstant` already prices DSCR on monthly payments. The sizing NOI comes from operations, which never depend on the loan, so there is no loop, the same as LA-1823.
- **Capital plan.** `fundMonthlyDevelopmentCashFlow` repays the construction balance in the takeout month in place of the sale month. The permanent loan funds that month. The rule that a project cost cannot fall after payoff stays; it now reads the takeout month. After takeout, each month charges interest on the opening permanent balance at rate over twelve, then principal on a level payment once interest-only months end. Operating cash pays debt service. A month whose operating cash falls short of debt service becomes an equity call, reported on its own line.
- **Returns.** `MonthlyPropertyReturnsInput` gains permanent loan proceeds, refinance costs, debt service and payoff, each optional so older runs read as zero. Levered cash flow adds net proceeds above the construction payoff in the takeout month, less debt service each month after, less the permanent payoff at sale. Cash-out flows into the LA-1863 waterfall as distributable cash with no waterfall change.
- **Lender tests.** When a permanent loan exists, DSCR can read its computed annual debt service in place of the stated `annualDebtService`. Keep the stated figure as an override so existing cases do not move.
- **Checks.** Monthly roll-forward of the permanent balance, takeout proceeds equal construction payoff plus costs plus cash-out (or less an equity paydown), sale payoff equals the closing permanent balance, and the sale falls on or before maturity. Each scenario sizes its own permanent loan on its own NOI, as LA-1823 does.
- **Scorecard.** Add the loan amount, binding cap, first-year debt service and DSCR to `model-scorecard.ts`, and map Graybarn's permanent loan cells in the Dropbox adapter.

**Defects to avoid matching.**

- Graybarn's amortization schedule (`Stab NOI Statement` rows 52 to 61) applies the annual rate once a year while the payment comes from a monthly `PMT`. Build monthly and stage that schedule's balances red.
- Graybarn sizes and tests on year-one PILOT NOI. Report the abated-tax figure as the workbook's arithmetic and the full-tax figure beside it, default full tax, as step 3 and LA-1823 do.
- 214 W Main's permanent loan sizes are all zero from a `#REF!`. Stage them red.
- 214 W Main types loan term and amortization as text that never drives the model. Make term and amortization real inputs and check the sale against maturity.

**Limits to state.** No prepayment penalty or defeasance at sale, no floating permanent rate (the dated rate path stays on the construction loan), no second refinance and no mezzanine.

## 11b. Save a Permanent Loan on a Case and Show It

`[Sonnet 5.5 - Medium]` This follows the LA-1820 and LA-1823 pattern: route, repository, editor section, results and run page.

**What it adds.** The capital route accepts and validates the `permanentLoan` block, the case repository reads and writes it, the Development Capital editor gets a Permanent Loan section with its own source and review state, and the results show takeout, sizing caps with the binding one marked, debt service by month, and payoff at sale. The run page lists its saved sources.

**Where it plugs in.** `development_capital_input` is a JSON column, so the block likely saves with no migration, as LA-1823 and LA-1863 did. Check the table's constraints first. If a migration is needed, push it with `supabase db push` and confirm with `migration list --linked` before merge. Scenario comparisons should show the permanent loan amount and DSCR for each scenario, since each one sizes its own.

## 11c. Add Commercial Spaces to Operations

`[Sonnet 5.5 - High]` The monthly lines are routine, but recoveries interact with the PILOT tax and the lender tests, and TI and commissions reach the capital plan. LA-1813 was the nearest match and ran at this tier.

**What it adds and why.** Benjamin and Graybarn both carry ground-floor or in-line commercial space, and the engine has no place for it. This issue adds commercial spaces to apartment operations, each with its own lease start, rent, recoveries, vacancy and first-generation leasing costs. Commercial NOI joins total NOI, so the sale, lender tests and loan sizing read it with no further change.

**Input shape.**

```ts
export type CommercialRecovery = {
  /** The expense the tenant reimburses: named operating expense lines or the property tax. */
  basis: { kind: "expense_lines"; lineIds: string[] } | { kind: "property_tax" };
  /** Share of the basis the space pays. Absent reads as the space's area share of total area. */
  sharePercent?: number;
};

export type CommercialSpace = SourcedLine & {
  areaSf: number;
  annualRentPerSf: number;
  leaseStartMonth?: string;
  leaseStartAnchor?: MilestoneAnchor;
  freeRentMonths: number;
  recoveries: CommercialRecovery[];
  /** First-generation costs at lease start. */
  tenantImprovementPerSf: number;
  leasingCommissionPercent: number;   // of rent over the lease term
  leaseTermMonths: number;
};

export type CommercialOperations = Evidence & {
  spaces: CommercialSpace[];
  vacancyPercent: number;      // on commercial income only
  creditLossPercent: number;   // on commercial income only
};
```

It sits on `ApartmentOperationsInputs` as `commercial?: CommercialOperations`. `GROWTH_CATEGORIES` gains `commercialRentPercent`, following LA-1838. `MonthlyApartmentOperations` gains commercial base rent, free rent, recoveries, vacancy and credit loss, commercial EGR and commercial NOI, plus residential NOI, so 11d can split value by use.

**Where it plugs in.** Commercial income adds to effective gross revenue after its own vacancy and credit loss. A tax recovery reads the scheduled tax the property pays, so it follows a PILOT. TI and leasing commissions enter the cost schedule as derived lines in the lease start month, so the capital plan funds them as project costs with no change to `development-capital.ts`, and they count in total cost and LTC. A commercial space never counts as a unit in any per-unit figure or in lease-up. Add Benjamin's commercial NOI, CAM reimbursement and TI total, and Graybarn's retail base rent, to the scorecard.

**Defects to avoid matching.**

- Graybarn applies one vacancy rate, labeled residential, to a base that includes retail and other income (`Stab NOI Statement!I31`). Kulka keeps commercial vacancy separate, so that cell will differ by design. Name the convention in the test.
- Graybarn counts the retail space as a unit in per-unit cells (`Summary Greybarn Patchogue!G35`). Never do that.
- Benjamin allocates general selling costs by a commercial share whose residential side points at a hotel row (`CF-Dispo!B34`). Do not reproduce it; it is reporting only.

**Limits to state.** No second-generation leasing or renewals, no percentage rent, no tenant-by-tenant downtime after the first lease, and no hotel or condo module.

## 11d. Price the Sale and Lender Value With a Cap Rate per Use

`[Sonnet 5.5 - Medium]` This is a small change in `property-returns.ts` and `lender-tests.ts` once 11c reports NOI by use.

**What it adds and why.** Benjamin values residential and commercial forward NOI at separate exit caps (`Dispo Value!P187` and `P188`). Today the engine has one terminal cap. This adds an optional commercial cap. Gross sale value becomes residential forward NOI over the residential cap plus commercial forward NOI over the commercial cap. The lender-test as-stabilized value and the LTV caps (construction and permanent) take an optional commercial cap the same way. With no commercial cap, every run matches today's.

**Input shape.** `PropertyReturnsPlan.commercialTerminalCapRatePercent?: number` and `LenderTestPlan.commercialCapRatePercent?: number`, each with evidence. It saves inside the sale plan and lender tests JSON, so this issue includes its editor fields and needs no migration.

**Where it plugs in.** `ForwardSalePeriod` gains residential and commercial NOI. The sale tax bases from step 3 apply to the residential and commercial parts in proportion to the tax each carries. Score Benjamin's commercial gross sale value.

**Defect to avoid matching.** Benjamin drops vacancy from residential sale NOI at `Dispo Value!O117`. The existing golden test for it stays red; the per-use split must not reopen it.

**Order note.** 11a also edits `property-returns.ts`. Merge 11a before starting 11d so the two never conflict.

## 11e. Save Commercial Spaces on a Case and Show Them

`[Sonnet 5.5 - Medium]` This follows LA-1820: route, repository, editor and results.

**What it adds.** The operations route accepts the `commercial` block, the case repository reads and writes it, the operations editor gets a Commercial section with one row per space, and the results show commercial income lines, residential and commercial NOI, and TI and commissions in the cost view. Commercial rent growth joins the Growth by Category section.

**Where it plugs in.** `apartment_operations_input` is JSON, so this likely needs no migration. If spaces need their own table for anchors (as milestones did in LA-1839), add the migration and push it before merge.

## 11f. Roll Monthly Results Into an Annual Cash Flow View

`[Sonnet 5.5 - Medium]` This is a report over results the engine already makes, with one choice of year basis.

**What it adds and why.** Benjamin, Graybarn and the v2.98 sample all show a year-by-year cash flow, and lenders read one. This adds a pure function that sums a completed property run into years and a results table that shows them. It changes no monthly number and adds no input to the run except the year basis.

**Shape.**

```ts
export type AnnualYearBasis =
  | { kind: "analysis_year" }                         // twelve months from the first model month
  | { kind: "calendar_year" }
  | { kind: "operating_year"; startMonth: string };   // e.g. the first stabilized month

export function annualCashFlow(run: PropertyReturnsResult, basis: AnnualYearBasis): AnnualCashFlowResult;
```

Each year shows every revenue line (vacancy and credit loss included, residential and commercial apart), operating expenses, property tax on the scheduled and full basis, NOI, capital expenditures, project costs, construction interest, permanent debt service, sale proceeds and payoff in the sale year, levered cash flow, and DSCR and debt yield for each full operating year. A part year at either end is marked with its month count. Each year carries a check that its months sum to the monthly totals.

**Where it plugs in.** It reads `PropertyReturnsResult` after the waterfall, so it adds no loop. It can also run on each scenario. Score the v2.98 annual hard cost sum and Benjamin's year-one NOI.

**Defects to avoid matching.**

- Benjamin's `10-Year CF` omits vacancy and credit loss and grows NOI past the monthly grid by a prior-year ratio. Kulka keeps every revenue line and never projects past the sale month. To see ten years, set the sale in year ten.
- Graybarn's ten-year statement types its taxes as blends of PILOT fiscal years, grows rent at a factor that does not match its labeled input, uses NOI for DSCR but cash flow after reserves for debt yield, and caps trailing year-ten NOI at sale. Kulka reads tax from the schedule, uses one stated basis for each test, and prices the sale on forward NOI. Stage those Graybarn rows red where they differ for these reasons.

## Decisions Only Matt Can Make

1. **Is the annual view a report over monthly results, or a separate annual mode?** Recommend a report. A separate annual mode would bring back the same-period annual screen the spec replaced, and every audited annual sheet that drifted from its monthly sheet did so because it was computed apart.
2. **Which year basis is the default in the annual view?** Recommend operating years from the first stabilized month, with the development period shown as one leading column. That matches how Benjamin and Graybarn label their pro forma years. Analysis years and calendar years stay available.
3. **Which NOI sizes the permanent loan by default?** Recommend an annualized trailing window with the month count stated on the case, because Benjamin's formula and a lender at takeout both size on trailing results. Forward twelve months stays as an option.
4. **What happens when permanent proceeds exceed or fall short of the construction payoff?** Recommend the case chooses: excess either goes to the equity holders through the waterfall or the loan is cut back to payoff. A shortfall is always an equity paydown in the takeout month, shown on its own line.
5. **Where do first-generation TI and leasing commissions sit?** Recommend in development cost, funded by the capital plan in the lease start month, so they count in total cost and LTC as Benjamin budgets them. The other choice is below NOI, which would leave them out of LTC.
6. **Does commercial vacancy stay separate from residential vacancy?** Recommend yes, with its own vacancy and credit loss percents. One shared rate is what produced Graybarn's mislabeled vacancy cell.
7. **Should the permanent loan's DSCR replace the stated debt service in the lender tests?** Recommend the computed figure when a permanent loan exists, with the stated figure kept as an override so saved cases do not move.

## Running the Lanes Side by Side

If 11a and 11c run at the same time, give each its own files:

- **11a owns** `development-capital.ts`, `property-returns.ts` (levered cash flow and payoff), the permanent loan helpers in `lender-tests.ts`, and a new `permanent-loan.ts` with its tests.
- **11c owns** `apartment-operations.ts`, `monthly-cost-schedule.ts` (the TI and commission lines), and a new `commercial-operations.ts` with its tests.
- **Shared, edit with care:** `index.ts` exports and `model-scorecard.ts`. Each adds lines only.
- **11c must not touch** `property-returns.ts`. Per-use value waits for 11d after 11a merges.

The seam to check at integration is the `MonthlyApartmentOperations` NOI fields. 11a's sizing reads `netOperatingIncome`, which 11c's commercial NOI changes. Add a test in whichever merges second that sizes a permanent loan on a case with a commercial space.
