# Benjamin Development Model Template Audit

Linear: LA-1685. This audit treats `Dev ModelKP - Benjamin 1.xlsm` as a benchmark source. It does not treat the workbook as a product specification or as authority for Kulka policy. The same template drives the 214 W Main JLL workbook, which has its own audit. This audit covers the template core.

This file holds no deal figures. The deal's amounts, rates, unit counts, dates, returns and party names live in `deal-figures.md`, `formula-map-values.csv` and `golden-tests.json`, which stay out of the repo.

## Source Record

| Field | Value |
|---|---|
| Source file | `Dev ModelKP - Benjamin 1.xlsm` |
| SHA-256 | `6a015cd586b014e8becb03a68d00d3ffdc8964a32671a95176449abcb22a8f3e` |
| Template version string | `Input!AB3` (named range `Version`) |
| Sheets | 23: 18 visible, 4 hidden, 1 very hidden |
| Formula cells | 296,573 |
| Defined names | 323, of which 10 point at `#REF!` |
| Charts | 59, of which 58 read `OFFSET` chart names |
| VBA | 39 modules and 135 procedures; the project is locked for viewing, and olevba still reads the source |
| External workbook links | None in the OOXML package |
| Excel data tables (`TABLE()`) | None; the sensitivity tables are values written by a macro |
| Calculation setting | `calcPr` carries only `calcId`, so calculation is automatic and iterative calculation is off |
| Circular references | None live. The model breaks its loops with pasted plug values in `Input!T1071:T1094` |
| Saved error cells | 23 formula cells hold Excel errors (listed below) |

The workbook was copied and read without edits, with openpyxl in formula mode and in saved-value mode. No macro ran. Saved Excel results supply every expected value in `golden-tests.json`.

### Sheets

| Sheet | State | Formulas | Role |
|---|---|---:|---|
| Protect | very hidden | 36 | Stale list of sheet names, code names and lock flags for the password macros |
| Input | visible | 3,935 | All inputs, plus the budget, plug block and error checks |
| Comments | visible | 0 | Reviewer notes keyed to Input cells |
| Input_Hotel | hidden | 119 | Hotel inputs |
| Cost Curves | visible | 1,234 | Timing curves, one block per allocation code |
| Overrides | visible | 3,860 | Month-by-month override grid for costs, sources, delivery, absorption, taxes, commercial and sale |
| Dev Budget | visible | 2,136 | Budget report |
| Proforma | visible | 1,371 | Current and stabilized annual pro forma and yields |
| Dispo Value | visible | 1,627 | Forward sale NOI and sale value |
| Sum-Exec | visible | 387 | One-page summary |
| Sensitivities | visible | 77 | Macro-written tables with a staleness flag |
| 10-Year CF | visible | 1,726 | Annual stabilized-year roll-up |
| CF-Dev Budget | visible | 35,895 | Monthly budget spread |
| CF-Sources | visible | 19,466 | Monthly sources and uses, loans, project returns |
| CF-Equity | visible | 29,781 | LP and GP funding, preferred return and promote tiers |
| CF-Resi Ops | visible | 26,524 | Monthly residential lease-up and operations |
| CF-Comm Ops | visible | 70,968 | Monthly commercial operations by tenant |
| CF_Hotel | hidden | 12,750 | Monthly hotel operations |
| CF-Dispo | visible | 6,480 | Monthly sale proceeds |
| Condo (WIP) | hidden | 870 | For-sale module; no other sheet reads it |
| CF-Data Tables | visible | 77,091 | Timeline, unit inventory, curve tables, unlevered returns |
| Sheet1 | visible | 0 | Permit fee calculator with typed values, not linked |
| Lists | hidden | 240 | Drop-down lists and allocation codes |

### Defined Names

- Ten names point at `#REF!`: `Crescent_CF`, `ExitCap_Sens_Avg`, `Sens_Steps_ECap`, `Sens_Steps_Rev`, and the six `SensTbl_*` names. No formula or macro uses them.
- `NetEquity_Invstr` points at `'CF-Equity'!XFB$25`, an empty cell near Excel's last column. Nothing uses it.
- Fourteen `HTML_*` names survive from a much older file that published a cash-requirements web page.
- Fifty-nine `DynChart_*` names use `OFFSET` to size chart ranges to the stabilization period.
- Key model names include `Plug_TDC` (used by 1,852 formulas), `TPC`, `IRR_Project`, `Units`, `GSF`, `Dispo` and `Stabilization`.

### Saved Error Cells

| Cells | Error | Cause |
|---|---|---|
| `Input!AR153:AR154` | `#NUM!` | `PV` with `DATEDIF(TODAY(), ...)` on a date already past; side calculation |
| `Input!Z392`, `AG392`, `Z400`, `Z402`, `AD402`, `AD404`, `AD406`, `T688` | `#DIV/0!` | Commercial, hotel and permanent loan ratios with a zero base |
| `CF-Sources!E75`, `E89`; `Sum-Exec!N59` | `#DIV/0!` | Land and mezz effective rates with no loan |
| `CF-Dev Budget!D59`, `D155`, `D267`, `D274`, `D275`, `D290` | `#N/A` | Budget rows with no curve code; their amounts come from other rows |
| `10-Year CF!G40` | `#REF!` | A deleted CF-Resi Ops row |
| `CF_Hotel!H70` | `#VALUE!` | Hotel date lookup with zero rooms |
| `CF-Dispo!D37` | `#VALUE!` | Multiplies by the text `n/a` in `D34` |
| `Lists!AM321` | `#NAME?` | Uses a name `match` that does not exist |

None of these errors reaches a total. They show the workbook's checks do not cover side blocks.

### VBA Procedures

All descriptions come from reading the source. No procedure ran.

| Module | Procedures | What they do |
|---|---|---|
| ThisWorkbook | `Workbook_BeforeSave`, `Workbook_AfterSave` | Set the Protect sheet to very hidden before saving, restore it after, and mark the file saved |
| Input_Tab | `CommandButton1_Click`, `Worksheet_FollowHyperlink` | Run `ReCalc` from the Input button; jump to input sections or open the budget navigator from header links |
| ReCalc | `ReCalc`, `FastCalc`, `FullCalc`, `CalcMethodCheck`, `CalcMethodRestore` | Paste each calculated plug over its hard-coded copy and recalculate until all plugs agree within 0.4, then save the prior run's metrics |
| Sensitivity_Mod2 | `SensitivityMacro2`, `SensitivityMacro3`, `StoreOrigSensData`, `RestoreOrigSensData` | Overwrite rent, cost, growth, exit cap and timing inputs step by step, record results as values, then restore the stored formulas |
| CF_DevBudg, DevBudg | `*_HideDetail`, `*_HideSubs`, `*_SubsOnly`, `Hide_*`, `*_ShowAll` (5 each) | Write a report type cell and hide rows marked "Hide" |
| Proforma_ResiComm, Dispo_Value | `HideUnUsed_*`, `*_ShowAll`, one button handler | Hide unused rows |
| Protection | `ChangePW`, `LockSheets`, `UnlockSheets`, `UpdateProtStatus`, `SheetNames` | Show the password forms and write lock status and sheet names to the Protect sheet |
| PW_Change, PW_Lock, PW_Unlock | Two button handlers each | Unprotect and protect twelve sheets with passwords typed into the form |
| General | `CalcMethCk_Man`, `CalcMethRestore`, `pagebrake` | Switch calculation mode and page breaks |
| Performance | `RangeTimer`, `SheetTimer`, `RecalcTimer`, `FullcalcTimer`, `DoCalcTimer` | Time recalculation and show a message |
| Testing, Module1 | `DependentReport`, `FindDependents`, `SetRangeNames`, `test`, `FindTest`, `Testingfinding` | Developer leftovers; `FindDependents` writes to a sheet that does not exist, and `SetRangeNames` uses an unset variable |
| CapBudg_Navi, CostCurve_Navi, Cost_Curves | 16, 61 and 1 handlers | Navigation forms that jump to budget sections and cost curve blocks |
| ReCalcResults, IRR_ERROR_Msg | Two handlers each | Close message forms and set a cancel flag |

### Suspicious VBA Flags

olevba raised nine flags. None of them shows a harmful action.

- **AutoExec.** The flags name `CommandButton1_Click`, `PW_Change` and `Worksheet_FollowHyperlink`. These run only when a user clicks a button or a header link. The project has no `Workbook_Open`, `Auto_Open` or other open-time routine.
- **open, output, run.** These words appear only in comments and message strings, such as "Recalculate open workbooks" and "re-run the macro".
- **Call.** These are ordinary VBA `Call` statements, not Excel 4 macro calls.
- **Hex strings.** These decode to class ID fragments in the project streams. For example, `00020819` and `00020820` are Excel's worksheet and workbook class IDs, and the rest are form and project GUID bytes.
- **Base64 strings.** These decode to the plain words "Hide" and "Sensitivity2".

A search for `Shell`, `CreateObject`, `GetObject`, `Declare`, `Lib`, URL or HTTP calls, `Open ... For`, `Print #`, `Kill`, `SaveAs`, `SaveCopyAs` and `Application.Run` found nothing. No macro runs a shell command, writes a file or calls out to a network. The macros only change cells, row visibility, sheet protection and calculation mode inside the workbook.

### Protect Sheet And Password Macros

The very hidden Protect sheet lists the sheets that the password macros lock, with their code names, a lock flag and a header row for protection options. It stores no password. The password forms take passwords from text boxes and pass them to `Protect` and `Unprotect`.

The forms are broken. They refer to a sheet code name `CF_Equity`, but no sheet has that code name today; the CF-Equity sheet's code name is `Sheet2`. `PW_Change` uses `Option Explicit`, so it stops with a compile error. `PW_Lock` and `PW_Unlock` handle the first eight sheets and then stop at the `CF_Equity` line with a "password error" message. No sheet is protected in the saved file. CF-Dispo carries a protection element without the sheet flag or a password hash.

## Workbook Risks

### Results That Are Wrong In The Saved File

- **Sale NOI adds vacancy back.** `Dispo Value!O117` is labeled "Less: Non-Revenue Units". Its formula takes the forward non-revenue loss and then subtracts `O116`, the vacancy line. Rows 116 and 117 together remove only the non-revenue loss, so the sale NOI carries no vacancy. That NOI sets the residential sale price in `Dispo Value!P187` and flows to every return. The monthly grid's own forward NOI, `CF-Resi Ops!I76`, is lower. Kulka must not match this number.
- **The 10-Year CF leaves out vacancy and credit loss.** `10-Year CF!K19` sums rows 14 to 18, and no vacancy or credit loss row sits in that range. Row 40 also points at a deleted row.
- **Sponsor net profit shows with the wrong sign.** `Input!AF9` and `Input!AL9` reverse the stored sign. `Input!AI9` does not.
- **Selling costs are allocated to the hotel.** `CF-Dispo!A34`, the residential share, divides the hotel row `I19` instead of the residential row `I20`. The summary therefore shows no residential selling cost. Net proceeds in `CF-Dispo!I33` are still right.
- **Two stabilized NOI figures disagree.** `Proforma!P181` and `Sum-Exec!R37` differ. Replacement reserves are part of NOI in CF-Resi Ops, while the Proforma tab keeps them below NOI. `Input!Z427` shows a warning on the property tax check.

### Hardcodes That Bypass Visible Inputs

- `Input!T749` puts the selling cost in "Other Selling Expense #4" as a percent typed inside the formula. The selling-cost inputs `Input!Q752` and `Input!Q753` stay blank. A reviewer note on `Input!T754` asked why the model had no selling expenses, and this cell looks like the patch.
- `Input!AC839` is a typed amount. The percent metric shown beside it in `Input!T839` does not feed it.
- `Input!AC1048` adds a typed constant to builder's risk.
- `Input!AC940`, `AC944`, `AC945`, `AC949`, `AC952` and `AC953` multiply hard cost by percents typed inside the formulas.
- `Input!AC834`, `AC837`, `AC845`, `AC848`, `AC853`, `AC854`, `AC958` and `AC960` hold typed arithmetic, a fixed amount plus a rate times a count, in place of quantity and rate inputs.
- `Input!N285:N290` multiply units by per-unit utility costs typed inside the formulas.
- `Input!AO48` holds a 16-digit factor that sizes residential parking area. It reads as a back-solved number.
- `Input!M365` divides the entered millage by 100, and `Input!S414` holds an assessment cap rate far below a market cap rate. The two errors offset, so the tax looks plausible while both inputs are wrong in isolation.
- `Cost Curves!G33` and three blocks like it, plus `G242`, `G258` and `G498`, add or subtract typed day counts to milestone dates.
- `Input!T685` sets the permanent loan funding date at stabilization plus a typed day count.
- `Input!AQ10` is a typed market cap rate used for the spread in `Input!AQ11`.
- `Proforma!O117` is a typed zero for current loss to lease, while `P117` is a formula.
- `Overrides!JF637` holds a stray value one column past the override grid. No formula reads it.
- Several budget lines are labeled "Old Project - Catch All" (`Input!AC911`, `AC994`, `AC1019`). They carry lump sums from another project.

### Circularity And Plugs

The development fee (`Input!AC1023`) and contingency (`Input!AC1062`) are percents of total cost, and total cost includes both. The construction loan, origination fee and equity also depend on total cost. The template breaks these loops with `Plug_TDC` and 23 other plugs: pasted values in `Input!T1071:T1094` that 1,852 formulas read. `Input!W1071:W1094` recalculates each plug, and `Input!Z1071:Z1094` flags a gap above 0.4. `Input!Y4` shows "RUN RECALC MACRO" when any plug is stale. A user who edits an input and skips the macro reads results built on old totals. The contingency is also labeled "Hard Cost Contingency" but uses total cost as its base.

`Input!Z1070` reads "ERROR" in the saved file because it tests `Plug_20`, which holds a placeholder. The real status cell, `Input!W1068`, reads "ok".

### Inputs Overwritten By Macros

- `ReCalc`, `FastCalc` and `FullCalc` write the plug cells in `Input!T1071:T1094`, the two columns beside them in rows 1071 to 1085, and the prior-run metrics in `Input!C1070:C1075`.
- `SensitivityMacro2` and `SensitivityMacro3` overwrite market and affordable rents (`Input!AG102:AG151`, `AG156:AG165`), the direct hard cost formula (`Input!AC784`), the residential exit cap (`Input!Q736`), the growth table (`Input!T62:T71`), the predevelopment months (`Input!R17`) and phase delivery months (`Input!O40:X40`, `O43:X43`). They restore stored formulas afterward. `StoreOrigSensData` never stores `Mos1stDU_Ph4` (`Input!X40`), so a run of table 8 leaves that cell holding its last test value.
- `SensitivityMacro2` clears four of its five tables before it writes. Table 5 keeps old values until it is overwritten.
- The report macros write `CFDevBud.Report.Type` and `Dev Budget!D1`.

### Macro Control Risks

- `FastCalc` has no iteration cap and runs under `On Error Resume Next`. A plug that never settles keeps the loop running. `ReCalc` and `FullCalc` stop after 50 passes.
- `ReCalc` pastes 24 plugs and `FullCalc` and `FastCalc` paste 15, so the three routines can leave plugs 16 to 24 in different states.
- `DoCalcTimer` restores iteration by setting the calculation mode to the iteration flag.
- The sensitivity macros call `FullCalc` once per table cell, so one run repeats the full plug loop dozens of times.

### Volatile And Fragile Formulas

- `OFFSET` appears in 1,023 formulas (CF-Data Tables, CF-Resi Ops, CF-Dev Budget, CF-Sources) and in 59 chart names. Excel recalculates all of them on every change.
- `TODAY()` appears in `Input!AR153` and drives a side calculation into `#NUM!`.
- No formula uses `INDIRECT`.
- Many budget rows find their curve by `MATCH` on a text allocation code. Renaming a code on Cost Curves breaks the link, which `Input!E1119` warns about.

### Stale Or Unlinked Content

- The Sensitivities sheet holds values from a different base case. `Sensitivities!A2` and `A51` read "NOT CURRENT".
- Several reviewer notes on the Comments sheet describe input values that differ from the saved inputs.
- Condo (WIP) is hidden, and no other sheet reads it. The hotel sheets are hidden but still feed CF-Data Tables, CF-Dev Budget and Sum-Exec.
- Sheet1 is a permit fee calculator with typed values and no links.

## What The Template Covers

The deal itself (asset type, units, area, uses mix, timeline, total cost, debt, equity, waterfall and exit) is in `deal-figures.md`. In short, the saved file models a high-rise rental apartment building with ground-floor commercial space, one construction loan, an LP and GP joint venture with a four-tier promote, and a sale soon after stabilization. The hotel, for-sale, mezzanine, land loan and permanent loan modules are present but off.

| Area | What the template does |
|---|---|
| Timeline | One monthly grid with named milestones: analysis start, due diligence, land close, construction start, first units, move-ins, last units, stabilization and sale. Commercial milestones run separately. |
| Phasing | Up to four delivery phases, each with sub-phases and months between starts. |
| Budget | About 300 budget rows in land, hard cost, A&E, legal, interest, financing fees, permits, FF&E, marketing, development fee, taxes, operating deficits, other costs and contingency. Each row takes a metric (per GSF, per unit, percent of a base) and an allocation code. |
| Cost timing | Allocation codes map to curve blocks. Each block has an anchor milestone, offset, duration or end override, and a shape: straight line, bell curve with slope, front loaded, back loaded or U-curve. A block can also repeat every N months. |
| Overrides | A monthly override grid can replace any budget line, loan funding, interest or repayment, delivery and absorption, property taxes, commercial lines, sale proceeds, and other sources and uses. `Overrides!G7` names the first overridden row. |
| Lease-up | Base absorption per month with 12 seasonal factors, pre-leases, lease term and retention (turnover), up-front and amortized concessions, and stabilization defined by an occupancy target held for a set number of months. |
| Residential operations | Up to 50 market-rate and 10 affordable unit types, 25 other-income lines (fees, parking, RUBS, amenity), vacancy, loss to lease, non-revenue units and credit loss. Expenses are split into controllable and uncontrollable lines, with lead time before first units, lease-up share, detail tabs and a staffing plan. |
| Growth | Separate year-by-year rates for market rent, affordable rent, other income, operating expenses, property taxes, commercial rent and hotel revenue. |
| Property tax | Cost basis or income basis, millage detail, special assessments, reassessment at sale, and current, stabilized and sale views. |
| Commercial | Up to 20 tenants with NNN rent, vacancy, growth start, lease term, leasing commissions, CAM and tax recoveries, free rent, TI and parking. |
| Hotel | Rooms, occupancy ramp, seasonality, departmental and undistributed expenses, and a separate exit cap. |
| Condo | For-sale unit pricing by type (work in progress). |
| Construction loan | Sized by LTC on `Plug_TDC` with an override, equity-first funding, interest on the opening balance at one fixed rate, lease-up NOI applied to interest, origination fee, optional paydown from early sales, and payoff at sale. |
| Other debt | Land loan; mezzanine loan with pro-rata or equity-first funding, interest reserve and yield-maintenance prepayment; permanent loan sized by the lower of DSCR and LTV, with escrows and fees. |
| Rate curves | None. Each loan uses one fixed rate, and the Overrides grid can replace monthly interest. |
| Other sources | Interim income, preferred equity and other sources, each with a grant or reimbursement flag. |
| Equity | LP and GP shares, GP-first or pari-passu funding with catch-up at LP entry, and separate preferred return start dates. |
| Waterfall | Pari-passu preferred return, return of capital, four IRR hurdle tiers with promotes, and a final split. Accrual uses monthly compounding to the stated annual rate. |
| Sale | Forward or trailing NOI windows by use, separate exit caps, a price override, selling costs, concession burn-off, excise tax and excess parcel sales. |
| Returns | Project levered IRR as monthly IRR annualized, one XIRR, equity multiple, net profit, peak equity and date, approximate unlevered IRR and multiple, current and stabilized yield on cost, and LP and GP IRR and multiples. |
| Sensitivities | Eight macro-written tables on rent, cost, rent against cost, exit cap against rent growth, and three timing variables. |
| Ten-year view | Up to 30 stabilized years of annual cash flow, extrapolated past the monthly grid. |
| Other modules | State franchise and excise tax estimates, a LIHTC estimate and a depreciation estimate, all off in the saved file. |

## Current Kulka Comparison

This comparison reads the engine on branch `claude/underwriting-continuation-4555c4` at commit `8cde9990fd0a8025e0ae8013010c31bf550027d0`: `monthly-cost-schedule.ts`, `apartment-operations.ts`, `development-capital.ts`, `property-returns.ts`, `apartment-scenarios.ts`, `underwriting.ts`, and the case and run code in `lib/underwriting`.

Kulka now has the monthly property core that the earlier audit asked for. It schedules cost lines straight-line or on a smoothstep S-curve, leases units at a flat pace from an operation start month, and keeps rent, non-revenue units, loss to lease, free rent, other income, vacancy and credit loss as separate lines. It funds costs equity first with one construction loan, charges interest on the opening balance, applies lease-up NOI to interest, and repays at sale. It values the sale on forward 12-month NOI and reports dated XIRR, multiples, profit, yield on cost and spread. It runs downside and upside scenarios on four inputs. Every run keeps its formula version, input snapshot, evidence and reconciliations, and the workbook has no equal to that.

The gaps against this template fall into three groups.

1. **Inputs Kulka cannot yet express.** Cost lines take a fixed amount only, so per-GSF, per-unit and percent-of-base budget rows need a basis type. A percent of total cost needs an in-engine solve in place of a pasted plug. Milestones, curve anchors, seasonal absorption, expense lead times, per-category growth tables and a property tax method are missing.
2. **Modules Kulka does not have.** Commercial tenants, the LP and GP waterfall, peak equity, mezzanine and permanent debt, other sources, per-use exit caps and the annual roll-up are missing.
3. **Conventions that differ on purpose.** Kulka uses XIRR on month-end dates, while the workbook annualizes a monthly IRR. Kulka's unlevered flow includes all project costs, while the workbook's "approximate" unlevered flow strips financing lines. Kulka sizes debt as a share of total uses, while the workbook uses LTC on a plug. Tests must name the convention they check.

`coverage-matrix.csv` lists each capability.

## Recommended Build Order

Each step is small and testable against `golden-tests.json`. Defect-staged tests stay red on purpose.

1. **Adapter fixture.** Map the saved file's cost lines, unit mix, operations and loan into current Kulka inputs, and record which golden tests the adapter can and cannot reach. This step needs no engine change.
2. **Cost line basis types.** Let a line carry per-GSF, per-unit or percent-of-another-line inputs and keep the derived amount separate. This needs a quantity field on the case.
3. **Percent-of-total solve.** Solve development fee, contingency and loan fee against total cost inside the engine, with an iteration cap and a reconciliation check. This depends on step 2.
4. **Milestones and curve anchors.** Add named milestones and let cost lines start from a milestone with an offset. This depends on the monthly spine only.
5. **Seasonal lease-up and stabilization test.** Add 12 monthly absorption factors and a target-occupancy-for-N-months stabilization rule. This depends on the current lease-up code.
6. **Expense timing and per-category growth.** Add a start offset and lease-up share per expense line, and separate growth rates for rent, other income, expenses and taxes. This depends on step 4 for anchors.
7. **Peak equity and current yield.** Report peak equity with its month and an untrended yield on cost. Both read existing results.
8. **Property tax method.** Add a cost or income basis with unit checks on millage and assessment ratio, so the offsetting-unit error in `Input!M365` and `Input!S414` cannot happen. This depends on step 6.
9. **Partnership waterfall.** Add LP and GP funding, preferred return and IRR tiers on top of reconciled levered cash flow. This depends on step 7.
10. **Commercial module.** Add tenants, recoveries, TI, commissions and a commercial exit cap. This depends on steps 4 and 6.
11. **More scenario deltas.** Add rent, cost and timing deltas through the same engine, never by writing into inputs.
12. **Optional debt and annual view.** Add mezzanine, permanent debt with refinance, other sources and an annual roll-up that keeps vacancy and credit loss.

## Product Rules To Keep

- Keep formulas in the deterministic engine, not in prompts, pages or macros.
- Never paste a plug. Solve loops in the engine and show the check.
- Never write test values into inputs. Run scenarios on copies.
- Keep source labels, source dates, review states, case revisions, formula versions and immutable runs.
- Treat imported workbook values as proposals until a person accepts them. Do not turn this deal's values into Kulka defaults.

## Files In This Audit

| File | In repo | Contents |
|---|---|---|
| `README.md` | Yes | This file |
| `formula-map.csv` | Yes | 80 calculations with sheet, cells, rule, Kulka target and priority; `saved_value` left empty |
| `coverage-matrix.csv` | Yes | Template capabilities against the current engine |
| `deal-figures.md` | No, Dropbox `BLDG/BLDG Labs/DEVELOPMENT/LA-1685 Model Audit/benjamin/` | The deal and the numbers behind each finding |
| `formula-map-values.csv` | No | The formula map with saved values and the workbook formula |
| `golden-tests.json` | No | 73 expected values with sources, units and stages |
| `cache.py`, `build_outputs.py`, `show.py`, `compact.py`, `hardcodes.py`, `stats.py` | No | Helper scripts that read the workbook copy |
