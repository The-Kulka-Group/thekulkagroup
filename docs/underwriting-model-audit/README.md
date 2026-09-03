# Apartment Development Model v2.98 Audit

This audit treats `Apartment-Development-Model_v2.98-lbbejt.xlsm` as a benchmark source. It does not treat the workbook as a product specification or as authority for Kulka policy.

## Source Record

| Field | Value |
|---|---|
| Source file | `Apartment-Development-Model_v2.98-lbbejt.xlsm` |
| SHA-256 | `3481af2b91836bdbb7603a60246aa0f8c0c3ea6654311252f5df40760ff2a280` |
| Workbook version | v2.98 |
| Author shown in workbook | Spencer Burton, Adventures in CRE |
| Sheets | 7 |
| Visible sheets | Version, Summary, Underwriting |
| Hidden sheets | Annual Cash Flow, Retail Income, Detail Expenses, Data |
| Formula cells | 47,292 |
| Named ranges | 124, including two print areas and one broken local `Version` name |
| VBA | Present, 34 procedures |
| External workbook links | None found in the OOXML package |
| Saved formula-error cells | None |
| Excel calculation setting | `autoNoTable` |

The source workbook was read without edits. Cached Excel results supply the expected values in the test file. A non-Excel renderer showed errors for unsupported Excel functions, so those preview errors were excluded from the audit.

## Workbook Findings

The workbook is useful as a breadth and calculation benchmark. It should not become the source code for Kulka. The audit found these risks:

- `Underwriting!I42` hardcodes the sample development fee at 3%. The visible fee input is `Underwriting!C42`, but the total formula does not refer to that cell. Kulka should use an explicit versioned fee rule and test that the displayed input drives the result.
- The loan recalculation macro turns the equity formula into a value, then uses Goal Seek. That mutates an input during calculation and weakens repeatability.
- Two recalculation loops have no local iteration cap. A bad flag can keep the macro running.
- The residual land value macro sets land value to zero before it asks for the target. A cancelled or bad entry can change the model before the solve finishes.
- The mill-rate macro sets two property-tax values to zero before it validates both user entries. One cancellation path can exit before screen updating is restored.
- The model relies on volatile `OFFSET` ranges, hidden calculation columns through `KC`, row insertion, named ranges, and saved calculation state. Those parts make spreadsheet edits hard to review.
- The workbook contains a broken local defined name: `Version` refers to `#REF!` on the Annual Cash Flow sheet.
- Sensitivity results depend on a separate recalculation action because the workbook calculation mode excludes data tables.

The static VBA scan found no auto-run routine, network call, shell call, or file-write routine. The scan does not prove that each macro is correct.

## What The Workbook Covers

The workbook models a ground-up apartment development on a monthly date spine. It includes:

- land, hard cost, soft cost, development fee, carry cost, and total uses;
- straight-line and S-curve cost timing;
- equity, construction debt, mezzanine debt, reserves, and funding order;
- optional permanent debt with LTV or construction-debt sizing;
- unit mix, free rent, loss to lease, non-revenue units, other income, and parking income;
- basic or detailed lease-up;
- basic or detailed operating expenses, management fees, insurance, and property taxes;
- optional retail tenants, recovery income, retail costs, and leasing reserves;
- untrended, trended, and sale-period pro formas;
- selling costs, debt payoff, and equity proceeds;
- monthly and annual property cash flows;
- unlevered and levered XIRR, equity multiple, net profit, yield on cost, and development spread;
- single and double promote waterfalls;
- vacancy, exit cap, income growth, and growth-start sensitivity cases;
- a residual land value macro.

## Current Kulka Comparison

This comparison uses the underwriting engine on `origin/main` at commit `0f7b96b719e6a2a8046a57d2c65963ee65cbe6f4`.

Kulka has a sound control layer that the workbook lacks as a shared system. It saves cases, source labels, source dates, review states, immutable input snapshots, formula versions, prior runs, and failed runs. It also blocks current results when the case revision changes. Those controls should stay.

Kulka's calculation engine remains a preliminary annual screen. It has 12 input fields and 14 results. It does not yet model time, draws, lease-up, separate income lines, debt service, a forward sale period, investor returns, or sensitivities. Its own interface states most of these limits.

The main gap is not the number of fields. The workbook is a monthly cash-flow model, while Kulka is a same-period annual ratio model. Adding more annual fields will not close that gap.

## Diagnostic Adapter Result

The following adapter maps the workbook's total land cost, hard cost, soft cost, effective residential rent, and combined vacancy and credit loss into Kulka's current fields. It is a diagnostic only because several field meanings do not match one for one.

| Input | Adapter Value |
|---|---:|
| Gross building area | 320,938 SF |
| Units | 300 |
| Purchase price | $8,230,000, using total land cost |
| Average monthly rent | $1,788, using residential rent after modeled non-revenue units |
| Hard cost per GSF | $132.829394 |
| Soft cost | 12.000380% of hard cost |
| Contingency | 0.000000% because the workbook has no separate sample contingency line |
| Vacancy | 6.000000%, combining 5% vacancy and 1% credit loss |
| Operating expense ratio | 40.038084% |
| Debt | 65.000000% |
| Interest | 9.500000% |
| Exit cap | 5.750000% |

This adapter makes hard cost, soft cost, and project cost before financing agree. It does not make income, financing, or sale value agree:

| Result | Current Kulka | Workbook Reference | Difference Driver |
|---|---:|---:|---|
| Project cost before financing | $55,975,762 | $55,975,762 | Matches the adapter scope |
| Net operating income | $3,628,051 | $4,088,812 untrended | Kulka omits other income and treats the rent field as the full revenue base |
| Value | $63,096,537 | $74,716,252 sale value | Kulka omits other income and forward sale-period growth |
| Loan amount | $36,384,245 | $39,705,281 construction debt | Kulka sizes debt on cost before financing; the workbook sizes debt on total uses with reserves |
| Equity required | $19,591,517 | $21,379,847 | Same financing-base difference |
| Annual interest | $3,456,503 | $4,754,370 capitalized interest | Kulka uses a full-balance annual estimate; the workbook uses monthly draws and carry |

## Recommended Build Order

### 1. Define The Model Contract

Add a versioned model contract before adding screens. The contract should define dates, periods, signs, units, rounding, cash-flow ownership, sale timing, debt funding order, and which output counts as the decision result. Each number should retain source and review metadata.

### 2. Build The Monthly Spine

Create one monthly timeline from analysis start through sale. Model land, hard cost, soft cost, development fee, financing fees, and carry as line items with start month, end month, and distribution method. Start with straight-line and S-curve methods.

### 3. Add Operations And Lease-Up

Keep unit types and other income as line items. Model operation start, units delivered, pre-leased units, lease-up pace, free rent, non-revenue units, growth start, vacancy, and credit loss. Separate residential rent from other income.

### 4. Add Debt And Carry

Model equity and debt funding order, monthly construction draws, interest reserve, operating shortfall reserve, fees, payoff, and optional permanent debt. The engine should reconcile sources and uses every month and over the full run.

### 5. Add Sale And Property Returns

Use a forward sale-period NOI, terminal cap, selling costs, and debt payoff. Produce monthly unlevered and levered cash flows, XIRR, equity multiple, net profit, yield on cost, and spread.

### 6. Add Sensitivity And Partnership Returns

Run scenario sets through the same engine. Do not use mutable spreadsheet-style data tables. Add waterfalls only after property cash flow passes reconciliation tests.

### 7. Add Optional Detail Modules

Add detailed operating expenses, property-tax mill rates, retail, permanent debt, residual land value, and a second promote as modules. Each module should state when it is on and preserve its inputs in the run snapshot.

## Product Rules To Keep

- Use the Daylight design system in `DESIGN.md` and `daylight.css`.
- Keep formulas in the deterministic engine, not in prompts or page components.
- Keep source labels, source dates, review states, case revisions, formula versions, and immutable runs.
- Show a formula trace and the inputs used for each result.
- Show sources and uses reconciliation, cash balance checks, debt roll-forward checks, and distribution reconciliation.
- Label assumptions by source and certainty. Do not turn sample workbook values into Kulka defaults.
- Keep the workbook import boundary explicit. Imported values should remain proposals until a person accepts them.

## Files In This Audit

- `formula-map.csv` maps workbook calculations to their source cells and Kulka targets.
- `coverage-matrix.csv` compares workbook functions with the current Kulka engine.
- `golden-tests.json` records expected outputs and tolerances from the workbook's saved Excel results.
