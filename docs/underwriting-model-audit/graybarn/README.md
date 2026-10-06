# Graybarn Patchogue Lender Model Audit

Linear: LA-1685.

This audit treats a sponsor's lender workbook for a multifamily development on Long Island as a benchmark source. It does not treat the workbook as a product specification or as authority for Kulka policy.

This file holds no deal figures. The deal's amounts, rates, unit counts, rents, taxes, dates, loan terms and party names sit in `deal-figures.md`, `formula-map-values.csv` and `golden-tests.json`, which stay out of the repo in Dropbox at `BLDG/BLDG Labs/DEVELOPMENT/LA-1685 Model Audit/graybarn/`. The helper scripts are there too. Every finding below names the cells that hold its numbers.

## Source Record

| Field | Value |
|---|---|
| Source file | `Copy of FM Graybarn Patchogue Mult 5 24_v16 LENDER.xls` |
| SHA-256 | `69dfce0755aaf5838d531e7acb483887df6f4b3b1b8d37e0ccc66060d9b34ae2` |
| Workbook version | v16, from the file name |
| Format | Legacy BIFF8 `.xls` with SummaryInformation, DocumentSummaryInformation and Workbook streams |
| VBA | None |
| External workbook links | None. The only SUPBOOK entries are the internal one and the add-in one that serves `EDATE`. |
| Sheets | 10, all visible |
| Hidden rows | `Sources & Uses of Funds` rows 43 to 60 |
| Hidden columns | None |
| Defined names | 13: nine `Print_Area`, three `Print_Titles`, and one hidden `_xlfn.SINGLE` that newer Excel adds on save |
| Formula cells | 1,480, all recovered |
| Numeric cells typed as values | 985 |
| Functions used | `SUM`, `AVERAGE`, `PMT`, `IRR`, and `EDATE` through the Analysis ToolPak add-in |
| Saved formula-error cells | None |

The workbook was read from a scratch copy and never written. The Dropbox original was not opened.

### Formula Recovery

xlrd 2.x reads saved values but drops formula tokens. `extract_formulas.py` walks the raw Workbook stream, keeps the token bytes from every FORMULA, SHRFMLA and ARRAY record, and passes them to xlrd's own `decompile_formula`. Shared formulas are expanded relative to each cell. All 1,480 formulas decompiled with no failures. So the formula map shows real workbook formulas. Rows marked `inferred` cover typed numbers, where the audit tested arithmetic between saved cells to find the rule a person used to produce them.

### Sheet Map

```
Summary Sheet  (unit mix, rents, timing, land value)
   |                 |                    |
   v                 v                    v
Stab NOI Statement  Construction Budget  Summary Greybarn Patchogue / Spec Sheet
   |   (valuation,      |   (costs, costs      (marketing summaries, read only)
   |    lender tests)   |    to date, loan)
   |                    v
   |             Interest Reserve Calc  --->  Construction Budget I44
   |                    |
   v                    v
5 Year NOI Stmt <--- Sources & Uses of Funds
   (ten years, refinance, IRR)

Projected Mthly NOI-lease up   (stands alone; nothing reads it)
IDA PILOT                      (stands alone; its figures are retyped elsewhere)
```

## The Deal In Outline

The workbook models one wood-frame apartment building with one in-line retail space on a suburban site. The rent roll has ten unit rows: one-bed and two-bed market units, plus workforce and affordable units under the IDA agreement and under the town's program. An IDA PILOT replaces full real estate taxes. The sponsor bought the land before the loan and has spent part of the soft costs. The lender package sizes a construction loan to the remaining cost, funds interest from the loan, and shows a take-out at stabilization on a permanent quote. `deal-figures.md` holds the numbers.

## What The Workbook Covers

- unit mix by type and income tier, with monthly rent and SF per row;
- one retail space priced per SF;
- nine other-income lines and a combined vacancy and bad-debt rate;
- three expense lines: taxes, operating expenses, and a management fee on EGI;
- a stabilized NOI statement with as-stabilized value, return on cost, LTV, DSCR, debt yield and debt constant;
- a construction budget with costs to date and costs to complete per line, and a land step-up from purchase price to a credited value;
- sources and uses on a printed page and on a hidden cash basis;
- a monthly interest schedule on a SOFR curve plus spread;
- a monthly lease-up statement with unit absorption by tier;
- a PILOT table by tax fiscal year;
- a ten-year annual pro forma with a refinance, amortization, a year-10 sale, IRR and equity multiple;
- market and demographic facts for the marketing pages.

## Workbook Findings

### 1. Value and every lender test rest on year-one PILOT taxes

`Stab NOI Statement!I36` is a typed tax figure that equals `5 Year NOI Stmt!H36`, the first and lowest PILOT-period figure. The PILOT table (`IDA PILOT!K10:K22`) rises each year as the exemption steps down. The workbook never shows NOI with later-year or unabated taxes. Value (`T10`), LTV (`U22`), DSCR (`T40`) and debt yield (`T41`) all use the year-one NOI, so each of them counts a temporary tax benefit as permanent. `deal-figures.md` shows how far the year-10 and final PILOT figures sit above the year-one figure.

### 2. The printed LTC uses credited land, and the cash LTC is hidden and incomplete

The land value is a typed per-unit figure in `Summary Sheet!U21`, which sits outside the print area. `Construction Budget!I11` turns it into a step-up over purchase price, and `M11` counts that step-up as cost already invested. The step-up then becomes sponsor equity (`Sources & Uses of Funds!W14`) and lowers the printed LTC (`F20`). The cash-basis table in hidden rows 43 to 60 shows a much higher LTC (`F57`), but its hard cost (`G48`) leaves out demolition and project contingency (`Construction Budget!I23`). So neither LTC in the file measures the loan against full cash cost. The audit derived that figure from `Construction Budget!N48` and `U48`.

### 3. The interest reserve is typed to hit the loan amount

The loan equals the cost to complete (`Construction Budget!N48`), and that cost includes the interest from `Interest Reserve Calc!G48`. The monthly draws (`F17:F47`) are typed values whose sum lands the final balance (`H47`) on the loan amount (`G8`) within a dollar. A budget change will not move the draws, so the reserve will stop tying without any warning. The initial funding input (`G6`) does not match the closing draw in `F17`, and `G6:G8` feed nothing in the schedule. The SOFR curve (`O18:O47`) and spread (`N18:N47`) are typed by month. Interest uses the opening balance times the rate over twelve and compounds into the loan. The schedule runs interest for the full loan term with no credit for lease-up NOI, and its draws run past the construction end date in `Summary Sheet!J78`.

### 4. Labeled growth inputs do not drive the pro forma

`5 Year NOI Stmt!W12:W15` and `W19` label the rent and expense growth rates. The rows they should drive (`H12:Q15`, `H37:Q37`) are typed values that grow at different rates. A reader who changes a labeled input changes nothing. The stabilized-year rent increase (`Stab NOI Statement!I16`) is also typed. It equals the year-1 base rent total in `5 Year NOI Stmt!H16` less `Stab NOI Statement!I15`.

### 5. One-time fees count as annual income

The lease-up sheet charges the amenity fee and the initial pet fee once per new lease (`Projected Mthly NOI-lease up` rows 35 and 39). The stabilized NOI (`Stab NOI Statement!I22`, `I26`) and the ten-year rows (`5 Year NOI Stmt` rows 23 and 27) carry them every year at full occupancy. That treatment assumes every unit turns over each year.

### 6. Stabilized vacancy and per-SF figures are typed

`Stab NOI Statement!I31` is a typed value. It equals the rate in `G31` times gross income less tax recovery (`I30` less `I21`), rounded. Its label says residential, but the base includes retail and other income. `K30:K32` are stale typed per-SF figures that no longer match their rows.

### 7. Square footage and unit denominators disagree across sheets

- `Summary Greybarn Patchogue!H31` is labeled affordable and workforce SF but pulls only workforce SF (`Summary Sheet!F66`). Its unit count `G31` includes both tiers. So `H35` net SF leaves out the affordable SF, and the loss factor in `H36` is wrong.
- `Spec Sheet!E32` computes the loss factor on net SF, not gross. That error and the one in `H36` give nearly the same figure, which hides both. The gross-basis share is `Summary Sheet!I22`.
- The per-SF cells in `Stab NOI Statement` column K divide by the short net SF in `Summary Greybarn Patchogue!H35`. `Sources & Uses of Funds!H20` also uses net SF, while the cells beside it use gross SF (`H37`).
- Per-unit cells across the budget, sources and uses, and valuation divide by `Summary Greybarn Patchogue!G35`, which counts the retail space as a unit. `Summary Sheet!O31` divides by residential units only, so the two value-per-unit figures differ.
- Gross SF lives in two typed places: the loss plug `Summary Sheet!H22` and `Summary Greybarn Patchogue!H37`. They agree today, and no cell checks them.
- `Summary Greybarn Patchogue!G63`, `Summary Sheet!M69` and `Summary Sheet!W63` use simple averages where a weighted average applies.

### 8. The ten-year pro forma mixes methods

- Taxes in `5 Year NOI Stmt!H36:Q36` are typed. Each is close to a fixed-weight blend of two PILOT fiscal years, and the PILOT payments themselves are typed (`IDA PILOT!K10:K22`), so nothing links the two sheets.
- Debt yield uses NOI in `H51` and cash flow after reserves in `I51:Q51`.
- DSCR (`H50:Q50`) uses NOI before reserves.
- The permanent loan schedule (`Stab NOI Statement` rows 52 to 61) applies the annual rate to the opening balance once a year while the payment comes from a monthly `PMT` times twelve.
- The refinance carries no closing cost (`Stab NOI Statement!AC26`) and no cash-out (`AD27`).
- The sale in `Q59:Q61` caps trailing year-10 NOI rather than forward NOI.
- `IRR(F75:Q75)` uses annual periods with sponsor equity at time zero, and that equity includes the credited land step-up. `F86` restates the multiple on cash invested, and no IRR on cash appears.
- Cash flow before debt service (`Stab NOI Statement!I45`, `5 Year NOI Stmt` row 45) subtracts reserves but adds leasing commissions and capital reserves. Those lines are zero today, so the sign error is latent.

### 9. Lease-up stands alone

`Projected Mthly NOI-lease up` types unit absorption, rents and expenses by month. Nothing reads its results. The interest schedule ignores its NOI and the returns skip it. It starts leasing in the first month after the construction end date, with units leased in month one, which implies pre-leasing that the file does not state. Months before full absorption carry no vacancy (`H44:P44`).

### 10. The PILOT table is typed

Only the percent-change column (`IDA PILOT!L11:L22`) holds formulas. Taxable AV (`I`) equals improvement AV times one less the exemption, and the payment (`K`) equals land AV plus taxable AV times the rate per 100 dollars, within the rounding of the displayed rate (`J`). The total (`K23`) is typed and ties to the column sum.

### 11. Smaller defects

- `Construction Budget!I40` has a percent in its label, but no set of up to five soft-cost lines reproduces it at that percent.
- `Construction Budget!I32` and `AA35` are constants written as formulas, and `AA91` and `AA93` are stray typed values outside the print area.
- `Summary Greybarn Patchogue!H13` shows the seller as zero because it reads the empty `Summary Sheet!O12`.
- `Summary Greybarn Patchogue!H15`, labeled year constructed or delivery, reads the stabilization end date.
- `Summary Sheet!K80` types a zero stabilization duration while its start and end dates differ.
- The mortgage summary (`Summary Greybarn Patchogue` rows 79 to 89) is empty.
- `Spec Sheet` rows 18 to 19 label unit counts as square feet.
- The OLE metadata shows a last-save date well after the deal's pricing inputs. `deal-figures.md` holds the dates.

## Current Kulka Comparison

This comparison reads the engine at commit `8cde9990fd0a8025e0ae8013010c31bf550027d0`: `monthly-cost-schedule.ts`, `apartment-operations.ts`, `development-capital.ts`, `property-returns.ts` and `apartment-scenarios.ts`.

Kulka already does several things better than this workbook. It schedules costs by line with straight-line or S-curve timing, solves the funding each run, and checks sources against uses and the debt roll-forward every month. It applies lease-up operating cash to interest, prices the sale on forward NOI, and computes dated XIRR. Every input carries a source, a date and a review state, and every run is saved with its inputs.

The gaps that matter for a lender package are these:

- **PILOT and tax abatement.** Kulka has no tax schedule. Taxes are a flat expense line grown at one expense rate. It cannot follow a PILOT, map tax fiscal years onto model months, or show NOI after the abatement ends.
- **Lender sizing tests.** Kulka reports debt as a share of total uses and nothing else. It has no LTV, DSCR, debt yield or as-stabilized value, and it cannot size a loan to the lesser of those tests.
- **Loan sizing basis.** Kulka funds equity first up to a target debt share. It has no costs invested before closing, no cost-to-complete sizing, and no credited land value. A lender view needs cash cost and credited value kept apart, with LTC shown on both.
- **Interest.** Kulka uses the same opening-balance convention but one fixed rate. A dated rate path would cover a SOFR curve.
- **Lease-up.** Kulka models lease-up on the same timeline as costs and debt, which the workbook does not. It uses a constant pace, so a per-month absorption schedule by tier would need an optional input.
- **Income detail.** Kulka has one income growth rate, no retail, and no one-time move-in fee unit.
- **Permanent debt.** Kulka pays off the construction loan in the final month. The spec lists permanent debt as a later module.

`coverage-matrix.csv` lists each capability.

## Recommended Build Order

1. Add a dated tax line that can follow a PILOT schedule (base AV, improvement AV, exemption steps, rate path, fiscal-year mapping). Report NOI and value with the tax for the valuation year and after the PILOT ends.
2. Add as-stabilized value at a stated date, then LTV, DSCR on stated debt service, and debt yield, each with a formula trace.
3. Add loan sizing modes: share of cost, cost to complete, and the lesser of lender test limits. Add cost to date per line for the cost-to-complete mode.
4. Add credited land value as a separate field from cash land cost. Report LTC and returns on both bases and flag credited equity.
5. Allow a dated interest rate path in place of one fixed rate.
6. Add an optional monthly absorption schedule, growth by unit type, and a one-time fee unit for other income.
7. Leave permanent debt, refinance and retail for the later modules the spec already names.

Before step 1, run the golden values through an adapter on the current engine, as the prior audit did, to see which `current-engine` fixtures it already meets. This audit did not run that adapter.

## Product Rules To Keep

- Keep formulas in the deterministic engine, not in prompts or page components.
- Keep source labels, source dates, review states, case revisions, formula versions and immutable runs.
- Do not turn this sponsor's figures into Kulka defaults. The golden values are fixtures.
- Keep lender tests as outputs with traces. Do not let a typed value stand in for a calculated one, as the workbook's draws, taxes and growth rows do.

## Files In This Audit

| File | Holds deal figures | Purpose |
|---|---|---|
| `README.md` | No | Source record, findings, Kulka comparison |
| `formula-map.csv` | No | 50 workbook calculations with cells, recovered or inferred rules, and Kulka targets; `saved_value` left empty |
| `coverage-matrix.csv` | No | Workbook capabilities against the current engine |
| `deal-figures.md` | Yes | The deal and the numbers behind each finding |
| `formula-map-values.csv` | Yes | `formula-map.csv` with saved values |
| `golden-tests.json` | Yes | Saved values as test fixtures with stages and tolerances |
| `extract_formulas.py` | No | Recovers formulas and saved values into `formulas.json` and `cells.json` |
| `dump_sheet.py` | No | Prints one sheet with values and formulas |
| `build_outputs.py` | No | Writes the formula maps and golden values from `cells.json` |
| `cells.json`, `formulas.json` | Yes | Script outputs: every saved value and every recovered formula |
