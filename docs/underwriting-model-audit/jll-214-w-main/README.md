# 214 W Main JLL Financing Model Audit

Linear: LA-1685.

This audit reads a lender financing workbook as a benchmark for Kulka's underwriting engine. It does not treat the workbook as a product rule. This file holds structure, formulas, cell references, the template diff, risks and capability findings. It holds no deal figures. The deal's numbers live in `deal-figures.md`, `formula-map-values.csv` and `golden-tests.json`, which stay outside the repo in Dropbox at `BLDG/BLDG Labs/DEVELOPMENT/LA-1685 Model Audit/jll-214-w-main/` with the helper scripts and extracted VBA.

## Source Record

| Field | Value |
|---|---|
| Source file | `Copy of 214 W Main _JLL Financing Model.xlsm` |
| SHA-256 | `0bbdce26b32647c89e05df122cdaea703d1b328759c1e985ae0616df603fb18b` |
| Template sibling | `benjamin.xlsm`, SHA-256 `6a015cd586b014e8becb03a68d00d3ffdc8964a32671a95176449abcb22a8f3e` |
| Sheets | 42 |
| Visible sheets | SUMMARY->, Loan Request, Sources & Uses, Project Summary, Development Overview, Development Budget, Stabilized NOI, Project Milestone, Proforma, Detailed Dev Budget, ASSUMPTIONS ->, Input, ANALYSIS->, CF-Sources, CF-Resi Ops, SUPPLEMENTAL->, Sum-Exec, Sum-Units(Mkt), Sum-NOI, Sum-Units(ADU), Sum-Bgt, 10-Year CF, Forward_Curve |
| Hidden sheets | Overview, Unit Mix, Dispo Value, Fees, Log, Input_Hotel, Overrides, Cost Curves, Sensitivities, CF-Dev Budget, OpCo, CF-Comm Ops, CF_Hotel, CF-Dispo, Condo (WIP), CF-Data Tables, CF-Nord, Lists |
| Very hidden | Protect |
| Formula cells | 308,762 (Benjamin: 296,574) |
| Largest sheets by formulas | CF-Data Tables 76,569; CF-Comm Ops 71,226; OpCo 39,224; CF-Dev Budget 36,259; CF-Resi Ops 26,784 |
| Defined names | 334, of which 16 refer to `#REF!` |
| Excel tables | 2: `Table_Updated_Fwd_Curve` on Forward_Curve and `Table2` on Fees |
| External workbook links | None in the OOXML package |
| Calculation setting | `calcPr` has no mode, so Excel runs automatic including data tables; no iteration flag |
| Saved formula-error cells | 255 (Benjamin: 23) |
| VBA | 42 modules, 140 procedures (Benjamin: 39 modules, 135 procedures) |
| Workbook status flag | `Input!Y4` saved as `RUN RECALC MACRO` |

The workbook was read with openpyxl in read-only mode, once for formulas and once for saved values. No macro ran and nothing was recalculated. The VBA was extracted statically with olevba.

### Broken Names

Sixteen names refer to `#REF!`. Ten pointed at the deleted CF-Equity sheet: `EMultiple_JVP`, `EMultiple_Spnsr`, `GrossCF_Invstr`, `GrossCF_Spnsr`, `NetEquity_Invstr`, `NetEquity_Spnsr`, `NetGain_JV`, `NetGain_Spon`, `Wtrfll_Final_Invst`, `Wtrfll_Final_Spnsr`. Two names that Benjamin lacks, `CapitalReserves` and `TerminalCapRate`, are also `#REF!`. Two point at deleted CF-Sources rows: `IRR_Project` and `EMultiple_Project`. Two point at deleted Proforma rows: `Yield_Current` and `Yield_Stable`. Benjamin has 10 broken names, all on its sensitivity tables.

### Saved Errors

| Sheet | Errors | Cause |
|---|---|---|
| Input | 114 `#REF!`, 3 `#DIV/0!` | Abatement table columns B and D read `Input!AL797`, which is `#REF!` because `AM796` adds a deleted cell. The permanent loan block (rows 746 to 766) breaks the same way. |
| Detailed Dev Budget | 83 `#VALUE!`, 3 `#REF!` | A new FILTER and ANCHORARRAY block starting at M305 saved as errors. |
| Cost Curves | 23 `#N/A` | Lookup gaps in the curve table. |
| Dispo Value | 11 `#DIV/0!` | Commercial lines with zero area. |
| Stabilized NOI | 8 `#DIV/0!` | Retail per-RSF cells divide by an empty `Q4`. |
| Other sheets | 10 | Mostly inherited from the template, such as `10-Year CF!G40` and `Lists!AM321`; Sum-Units(Mkt) and Sum-Units(ADU) hold 2 each. |

None of these errors reaches a lender tab total.

### VBA Diff Against Benjamin

No procedure is new by name and none was removed. One procedure changed:

- `ReCalc.ReCalc` lost 16 commented lines that reset waterfall formulas. The code itself is the same.

One module is new: `CF_DevBudg1`, the code module for the OpCo sheet. Its code matches `CF_DevBudg` line for line, which accounts for the five extra procedures. Benjamin's `Sheet2` module is gone with its sheet, and three empty sheet modules (`Sheet9`, `Sheet11`, `Sheet12`) belong to the new lender tabs. The six forms differ only in their `VB_Base` GUIDs.

The static scan found no network, shell or file-write call. `ThisWorkbook` hides the Protect sheet before save and shows it after. No macro refers to Fees, Log, OpCo, Forward_Curve or CF-Nord, so every new 214 W Main feature lives in formulas.

The macros now fail on their own terms. `ReCalc` starts with `IsError(Range("IRR_Project"))`, and that name refers to `#REF!`, so the first line should raise a run-time error before any plug is pasted. The error handler on that path is commented out. Even if it ran, its loop compares `Plug_10` and `Plug_11` with `PlugCalc_10` and `PlugCalc_11`, which now read empty cells `Input!X668:X669`. The gap never closes, so the loop would stop at its 50-pass cap with an error message. The circular items that matter (`Plug_TDC`, `Plug_4`, `Plug_7`) sit within the macro's 0.4 tolerance in the saved file, so the saved results are internally consistent, but nobody can refresh them through the macro.

## Template Diff

The workbook comes from the same template as Benjamin. The comparison turns every formula into a relative R1C1 form, then drops row and column offsets to get a shape. Two sheets match when they hold the same set of shapes. A count of cells at the same address would overstate the change, because 214 W Main inserted rows in Input (70 rows above the budget block) and moved rows in the cash-flow sheets.

| 214 W Main sheet | Benjamin sheet | Benjamin formulas | 214 W Main formulas | New shapes (cells) | Removed shapes (cells) |
|---|---|---:|---:|---:|---:|
| Protect | Protect | 36 | 36 | 0 (0) | 0 (0) |
| Input | Input | 3,936 | 4,749 | 149 (1,083) | 146 (270) |
| Input_Hotel | Input_Hotel | 119 | 120 | 1 (1) | 0 (0) |
| Overrides | Overrides | 3,860 | 4,207 | 3 (347) | 0 (0) |
| Cost Curves | Cost Curves | 1,234 | 1,240 | 7 (22) | 5 (16) |
| Sensitivities | Sensitivities | 77 | 77 | 0 (0) | 0 (0) |
| Detailed Dev Budget | Dev Budget | 2,136 | 2,320 | 5 (184) | 0 (0) |
| Proforma | Proforma | 1,371 | 1,539 | 16 (276) | 15 (108) |
| Dispo Value | Dispo Value | 1,627 | 1,766 | 13 (164) | 10 (25) |
| CF-Dev Budget | CF-Dev Budget | 35,895 | 36,259 | 7 (1,041) | 6 (677) |
| CF-Sources | CF-Sources | 19,466 | 17,538 | 4 (126) | 13 (2,054) |
| CF-Resi Ops | CF-Resi Ops | 26,524 | 26,784 | 5 (261) | 1 (1) |
| CF-Comm Ops | CF-Comm Ops | 70,968 | 71,226 | 4 (474) | 1 (216) |
| CF_Hotel | CF_Hotel | 12,750 | 12,485 | 2 (2) | 2 (267) |
| CF-Dispo | CF-Dispo | 6,480 | 6,480 | 0 (0) | 0 (0) |
| CF-Data Tables | CF-Data Tables | 77,091 | 76,569 | 14 (3,317) | 23 (3,839) |
| Sum-Exec | Sum-Exec | 387 | 380 | 5 (33) | 10 (40) |
| 10-Year CF | 10-Year CF | 1,726 | 1,726 | 0 (0) | 0 (0) |
| Condo (WIP) | Condo (WIP) | 870 | 870 | 0 (0) | 0 (0) |
| Lists | Lists | 240 | 240 | 0 (0) | 0 (0) |

Seven sheets carry the same logic: Protect, Sensitivities, CF-Dispo, 10-Year CF, Condo (WIP), Lists and Input_Hotel. The rest share the template's engine, with these real logic changes:

- **CF-Sources.** The construction loan rate now comes from the forward curve. Row 106 uses `IFS` to take the first curve rate before the curve starts, the last rate after it ends, and a monthly `MATCH` into `Table_Updated_Fwd_Curve` in between. Interest in row 101 is that rate times the opening balance over 12. The template's permanent loan rows (Benjamin rows 117 to 121) and the project IRR and multiple cells (`I61`, `I62`) were deleted.
- **CF-Data Tables.** The permanent loan close and payoff rows were removed. A new row 136 applies the tax abatement percent to calculated property tax (`K134*(1-K135)`). Row 80, which applies cash to the shortfall reserve, now holds `SUM(K87,#REF!)` in 255 columns. It saves as zero only because `Input!AL225` is zero.
- **Proforma.** New rows 204 to 217 compute a market-tax expense line from `Dispo Value!P155`, NOI with market taxes, and the NPV of the tax abatement from `Input!AR517` and `AR518`.
- **CF-Resi Ops and CF-Comm Ops.** Each gained one NOI row (`K79 = K76-K35-K36` and `K64 = K60-K56`). Only the broken permanent loan sizing block reads them.
- **Overrides.** Row 61 (construction management fee) and row 263 (development fee) now pay a share of the fee at land close through formulas in the override grid. Row 290 links CF-Nord staff overhead times zero, so it adds nothing.
- **CF-Dev Budget.** It points at the renamed Detailed Dev Budget sheet, adds annual sums in EC:EN, adds an `I320 = I318-TPC` check, and drops the template's per-subtotal `ERROR` checks in column H.
- **Input.** The unit tables read the hidden Unit Mix sheet, an affordable unit block with AMI levels sits in rows 154 to 190, a PILOT and abatement table fills rows 506 to 556, the other-sources block names a county loan and a state grant, and the financing block adds `Int_Spread` (`Input!O692`) and the curve choice (`Input!M690`).
- **Detailed Dev Budget.** A new FILTER block at M305 lists budget lines; it saves as `#VALUE!` and nothing reads it.
- **Sum-Exec.** Text cells that showed project IRR, multiple and yields were deleted; per-SF divisors changed from total NSF to market or affordable NSF.
- **Removed from the template.** CF-Equity (the LP and GP waterfall), Comments and Sheet1. Ten waterfall names were removed with it and ten more now read `#REF!`.

## Sheets Only In 214 W Main

| Sheet | State | What it does | Read by |
|---|---|---|---|
| Loan Request | Visible | Loan amount rounded to thousands, per unit, per GSF and per RSF; untrended and trended debt yield; LTC; stabilized value; LTV. Term, loan type, rate, amortization and prepayment are typed text. | Nothing |
| Sources & Uses | Visible | Equity, a county loan and the senior loan against land, hard, soft, interest and financing fees, each rounded. | Loan Request |
| Project Summary | Visible | Address, building and story counts (typed), GSF, unit mix by tier from the two Sum-Units sheets. | Nothing |
| Development Overview | Visible | A second copy of Project Summary with market and affordable unit sizes and a typed affordability note. Its story count differs from Project Summary's. | Loan Request, Sources & Uses, Stabilized NOI |
| Development Budget | Visible | Budget summary by land, hard, soft and carry with per unit, per GSF and per RSF. | Stabilized NOI |
| Stabilized NOI | Visible | Untrended and trended NOI by line, a market-tax NOI, and project cost net of the abatement NPV. | Loan Request |
| Project Milestone | Visible | Five milestone dates from Input. | Nothing |
| Overview | Hidden | An older version of the overview whose typed affordability note conflicts with Development Overview. | Nothing |
| Unit Mix | Hidden | Unit list from the design set with AMI tier, size and rent. | Input (52 cells) |
| Sum-Units(Mkt), Sum-Units(ADU) | Visible | Dynamic-array tables (FILTER, SORTBY, ANCHORARRAY) that group units by bedroom count for each tier. | Project Summary, Development Overview |
| Fees | Hidden | Municipal fee schedule with quantity, unit rate and a contingency per fee. | Input fee lines (6 cells) |
| OpCo | Hidden | A copy of CF-Dev Budget that rolls budget lines flagged `ND` into annual columns. The flagged lines are fees paid to the sponsor's own company. Its local `TPC` name sums those years. | Nothing; Input!AP14 repeats the total with its own FILTER |
| Log | Hidden | A change log with one entry and a starting-value row. Its live cells J5:M5 read Input cells that the row shift emptied. | Nothing |
| Forward_Curve | Visible | 120 monthly rows of 1-month and 3-month Term SOFR from an outside provider, a spread column from `Int_Spread`, and an effective rate in column I. | CF-Sources (244 cells) |
| CF-Nord | Hidden | Monthly direct overhead for four named staff. | Overrides row 290, multiplied by zero |

## How The Lender Package Is Built

1. Input and Unit Mix set units, rents, costs, dates and financing terms. Hidden sheets carry most of the logic.
2. CF-Dev Budget spreads each budget line by month. Interest and the development fee depend on total cost, which depends on them. The template breaks this loop with macro-pasted plugs (`Plug_TDC`, `Plug_4`, `Plug_7`) in `Input!T1141:T1164`.
3. CF-Sources funds costs equity first, then draws the senior loan up to LTC times `Plug_TDC`. Monthly interest uses the forward curve. Lease-up NOI pays part of the interest (row 102), and the rest becomes the budget's interest line through `CF-Dev Budget!I155`.
4. Stabilized NOI reads Proforma. Its headline NOI uses PILOT taxes. A second NOI uses market taxes.
5. The exit takes forward twelve-month NOI with market taxes, divides by the exit cap (`Input!Q804`), and adds the present value of abated taxes after the sale (`Input!Q806`). Loan Request uses this total as its stabilized value.
6. Loan Request divides the rounded loan by rounded total cost (LTC), by that stabilized value (LTV), and by both NOI figures (debt yield).

## Workbook Risks

1. **A funded grant is missing from the lender tabs.** `CF-Sources!I38` funds the grant typed into `Input!Q775` as a cash source. `Input!P670` (equity) subtracts other sources in rows 772, 773, 774 and 777, but not row 775. Sources & Uses shows only equity, the county loan and the senior loan. The cash flow therefore has more money than the lender summary shows, and the extra flows to equity distributions. The grant amount is also typed inside the formula (`=IF($AQ$4="Yes",<amount>,0)`), not in an input cell.
2. **The headline debt yield and LTV rest on the tax abatement.** Loan Request debt yield uses NOI with PILOT taxes. LTV uses a value that adds the PV of abated taxes. Neither tab shows the market-tax version, though Stabilized NOI row 50 computes the NOI. The PILOT payment is a typed constant in `Input!Q517` with zero growth in `AO518:AO533`.
3. **No coverage ratio exists for the construction loan, and the permanent loan block is dead.** Sum-Exec shows `n/a` for DSCR. The permanent loan section (`Input!H728:AJ766`) reads `T752 = AL797`, which is `#REF!`, so its NOI table, DSCR, LTV and debt-yield sizes all save as zero.
4. **Two discount rates value one abatement.** The lender tab and the sale price use `Input!AR515`. The template's own PV block (`Input!AE509:AE512`) uses `Input!Q512`, a different rate. The labels name only one of them.
5. **The forward curve has no as-of check.** The curve's first reset date sits well before the date the model shows as prepared, and nothing compares them. `Info_Date` is `=TODAY()`, so Sum-Exec and the cash-flow headers print the date the file was opened, not the date of the analysis. Stabilized NOI types its untrended date as a constant in `F2`.
6. **Typed loan terms do not drive the model.** Loan Request types the term, extension structure, loan type, rate and amortization as text. The model repays the loan at disposition (`Input!O705`) and never tests the term or charges extension fees. The budget label at `Input!H985` prints the fixed-rate input `Input!O691`, while the loan uses the curve.
7. **Levered returns are gone.** The project IRR and multiple formulas were deleted, and `IRR_Project`, `EMultiple_Project`, `Yield_Current` and `Yield_Stable` are `#REF!`. The only levered figures left are values the macro pasted into `Input!C1140:C1145` on some earlier run. The one live IRR is the unlevered IRR at `CF-Data Tables!I332`.
8. **The macros cannot refresh the plugs.** See the VBA section. The saved file flags itself with `RUN RECALC MACRO` at `Input!Y4`.
9. **Contingency carries a misleading label.** Development Budget row 18 calls the line "Soft Cost Contingency". Its source, `Input!AC1132`, is a general contingency on total cost less land less `ND` lines (`Plug_14`), so it covers hard cost too. The hard cost contingency input (`Input!T887`) is zero.
10. **Sponsor fees are paid early.** Overrides rows 61 and 263 pay part of the construction management and development fees at land close. OpCo rolls up every fee the sponsor's company earns, but no lender tab shows that total.
11. **Hidden sheets drive visible lender tabs.** Unit Mix feeds the unit rows, Dispo Value feeds market taxes and exit NOI, CF-Data Tables feeds the IRR and taxes, and Overrides holds typed monthly amounts for eight soft cost lines (rows 77 to 134). A reviewer who sees only the lender tabs cannot see these inputs.
12. **The lender tabs disagree with each other.** Project Summary and Development Overview type different story counts, and Input types a third description of the product. Development Overview and the hidden Overview type different affordability notes. The Stabilized NOI footnote mentions a non-revenue home that the model sets to zero.
13. **Dead weight.** OpCo holds 39,224 formulas that no lender figure reads. CF-Nord holds personal salary detail that adds zero. Both should stay out of any import.
14. **Lender unit tables need current Excel.** Sum-Units(Mkt) and Sum-Units(ADU) use FILTER, SORTBY and ANCHORARRAY spills. Older Excel or other parsers will show errors where this file saved values.

## Current Kulka Comparison

This comparison reads the engine at commit `8cde9990fd0a8025e0ae8013010c31bf550027d0`. The engine has moved past the annual screen in the prior audit. It now has a monthly cost schedule with straight-line and S-curve lines, apartment operations with unit types, lease-up, other income, vacancy and credit loss, a development capital module, forward sale value and dated XIRR, and scenario deltas.

Several 214 W Main conventions already match Kulka:

- Equity funds first (`equity_first.v1`).
- Monthly interest uses the opening balance (`opening_balance_monthly.v1`).
- Positive operating cash pays interest before the remainder is capitalized (`capitalized_net_operating_cash.v1`).
- Sale value uses forward twelve-month NOI over a terminal cap (`forward_twelve_month_noi.v1`).
- Kulka solves the debt share against total uses inside the engine with an iteration cap, so it needs no macro plug.

The lender features 214 W Main adds have no Kulka equivalent yet:

- `DevelopmentCapitalPlan` takes one `annualInterestRatePercent`. There is no dated rate schedule, spread, curve source or curve date.
- No result reports debt yield, LTV or DSCR. `property-returns.ts` lists yield on cost and development spread only.
- `ResidentialUnitType` has units, non-revenue units, area and rent. It has no affordability tier or AMI level.
- `OperatingExpenseLine` is a flat amount per year, per unit or percent of EGR. There is no tax schedule, PILOT, abatement or market-tax NOI.
- Sources are equity and one construction loan. There are no grants or soft loans.
- Cost lines carry flat amounts. There is no fee rule on total cost or on equity, and no contingency rule with a named base.

`coverage-matrix.csv` lists each capability. `formula-map.csv` maps 60 lender-facing calculations to their cells and Kulka targets, with saved values left blank.

## Recommended Next Work

1. Add lender metrics to property returns: debt yield on both NOI bases, LTV with and without abatement value, and interest-only coverage on stabilized NOI.
2. Add a dated floating rate schedule to development capital with a spread, a curve source and an as-of date.
3. Add other sources with timing and a reconciliation check that ties every source to the summary.
4. Add a property tax schedule with abated and unabated liability, and an optional abatement value at sale with one stated discount rate.
5. Add affordability tier and AMI level to unit types.
6. Add fee and contingency rules that name their base.

Each step should take the matching tests in `golden-tests.json` through an adapter before the module claims parity.

## Files In This Audit

- `README.md`: this file, with no deal figures.
- `formula-map.csv`: lender-facing calculations with cells and Kulka targets, `saved_value` blank.
- `coverage-matrix.csv`: workbook capabilities against the current engine.
- `deal-figures.md`, `formula-map-values.csv`, `golden-tests.json`: deal figures; keep outside the repo.
- Helper scripts: `cache_workbook.py`, `names.py`, `sheet_stats.py`, `vba_extract.py`, `template_diff.py`, `shapes_show.py`, `xref.py`, `dump.py`, `build_outputs.py`.
