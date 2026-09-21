---
name: generate-estimate-from-unit-cost-report
description: Turns a ProEst "Estimate Unit Totals" unit cost report (PDF) into the client-facing SOW + pricing + 4-column bid-leveling workbook. Use when Matt has a ProEst unit cost export (or any priced unit-totals report) and wants it as an estimate sheet, a leveling workbook, or a quantified scope to send subs. For scope built from drawings rather than a unit cost report, use generate-sow-with-pricing-and-leveling directly.
---

# Generate Estimate From Unit Cost Report

ProEst already holds the scope, the quantities and our unit rates. This skill moves that
unit cost report into the leveling workbook without re-typing a number and without losing a
penny against ProEst's own totals.

Output: `[Project]_SOW_Leveling_Quantified_[YYYY-MM-DD].xlsx` -- the workbook defined by
`generate-sow-with-pricing-and-leveling`. That skill owns the grid, the borders, the gutter,
the markup ladder and the SOV. **Read it before building.** This skill owns only the
report -> `sow_pricing_data.json` conversion and the three builder fixes below.

## Pipeline

```
1. CONFIRM   -> project name, job number, date, prepared-by, output folder
2. PARSE     -> python scripts/parse_proest_pdf.py estimate.pdf sow_pricing_data.json \
                  --project "Name" --job 260120 --date YYYY-MM-DD --prepared_by "..."
3. REVIEW    -> read every issue the parser prints. Nothing ships unexplained
4. NOTES     -> add notes[] / markup_labels[] to the JSON (see Notes below)
5. BUILD     -> python scripts/build_sow_pricing_xlsx.py sow_pricing_data.json raw.xlsx
6. FINALIZE  -> python scripts/finalize_workbook.py raw.xlsx out.xlsx      <- never skip
7. VERIFY    -> soffice --headless --convert-to pdf out.xlsx --outdir /tmp/chk
                Read back page 1, a dense page, the ladder page, the SOV and the notes sheet
8. RECONCILE -> workbook TOTAL must equal the report's grand total to within a few cents
9. DELIVER   -> SendUserFile, then into the job folder
```

`scripts/build_sow_pricing_xlsx.py` in this skill is the builder from
`generate-sow-with-pricing-and-leveling` with fixes 1 and 2 already applied. If you run the
other skill's copy instead, apply them yourself first.

## Cache the formula results, or the money column looks empty

**openpyxl writes a formula with no cached result.** Excel recalculates on open, so the
workbook is correct -- but the Claude file preview, macOS Quick Look, most mobile viewers
and anything else that reads the file without a calculation engine render every formula cell
**blank**. To the person who opens it, the Total column, the TRADE TOTALs, the SUBTOTAL and
the TOTAL simply are not there.

`scripts/finalize_workbook.py` recalculates through LibreOffice, which stores a cached `<v>`
beside every `<f>`, then repairs the one thing LibreOffice drops --
`<outlinePr summaryRight="0"/>`, which otherwise moves the collapse button to the wrong side
of the sub-bid group. Formulas stay live: typing a sub's bid still rolls up.

Confirm it worked before delivering:

```python
import openpyxl
d = openpyxl.load_workbook(out, data_only=True)["Scope of Work"]
assert isinstance(d["E12"].value, float)      # a line item extension
assert isinstance(d["E22"].value, float)      # a TRADE TOTAL
```

`data_only=True` returning `None` means nothing was cached and the workbook will look empty
to the client. That check is the whole point; run it every time.

## The rate-precision rule

**ProEst prints unit rates rounded to cents but extends at full precision.** Multiply the
printed rate by the printed quantity and a big SF line drifts $50 from the report's own
extended total; across a job the workbook disagrees with the estimate it came from, and that
is the one defect an estimator will not forgive.

So the parser re-derives `rate = report_total / qty` and stores it at six decimals. The cell
still **displays** the printed rate (currency format, 2 dp) because the difference is in the
fourth decimal -- only the stored precision changes, and `Total = Qty x Rate` now lands on
the report's number. A derived rate that rounds to something other than the printed rate is
reported as `RATE MISMATCH` and must be looked at, not ignored.

## Three fixes the builder needs

`build_sow_pricing_xlsx.py` ships without any of them.

1. **Unit rates never reach the sheet.** Column D is written empty:

   ```python
   ur=ws.cell(r,4); ...                      # before
   ur=ws.cell(r,4, ln.get("rate")); ...      # after
   ```

2. **`#VALUE!` down every sub column.** A TRADE TOTAL with no bids renders `"-"` (text), and
   the SUBTOTAL / markup / TOTAL formulas chain those cells with `+`. Text plus number is
   `#VALUE!`, so the moment the workbook opens, four of its five money columns are errors.
   Wrap every reference in `SUM()`, which ignores text, on **both** the Scope of Work and
   the SOV sheet:

   ```
   SUBTOTAL : =IF(SUM(E12,E30,...)=0,"-",SUM(E12,E30,...))
   markup 1 : base = SUM(E<sub>)
   markup n : base = SUM(E<sub>)+SUM(E<m1>:E<r-1>)
   TOTAL    : =IF(SUM(E<sub>,E<m1>:E<m6>)=0,"-",ROUND(SUM(E<sub>,E<m1>:E<m6>),2))
   ```

3. **No cached results** -- see above. Always finish through `finalize_workbook.py`.

## Trade mapping

ProEst subdivisions are cost codes, not bidders. Group them into the entity that actually
bids the work, per the consolidation rules in `generate-sow-with-pricing-and-leveling`.
`TRADE_MAP` in the parser covers the standard Kulka ProEst code set; extend it rather than
letting a line fall through -- an unmapped subdivision is reported and **dropped**, which
silently loses money.

| ProEst | Trade block |
|---|---|
02.00050 | Demolition |
03.00000, 03.03200 | Concrete |
06.02200 | Custom Millwork |
07.03000 | Roofing |
08.01100, 08.01400, 08.01500 | Doors, Frames & Hardware |
08.05000 | Glass & Glazing |
09.00951 | Acoustical Ceilings |
09.02300 | Drywall & Carpentry |
09.06000 | Flooring |
09.09100 | Painting |
10.04400 | Specialties |
11.03100 | Equipment & Appliances |
21.xxxxx | Fire Protection |
22.00000, 22.04000 | Plumbing |
23.00000 | HVAC |
26.xxxxx | Electrical |
28.04600 | Fire Alarm |
97.xxxxx | **not a trade** -- exclusion/allowance text, goes to Notes & Clarifications |

The CSI column carries codes only. Spelling out subdivision names overflows the merged trade
header on any trade with more than two of them.

## What the parser flags, and what to do about each

| Flag | Meaning | Action |
|---|---|---|
`NO QUANTITY` | qty 0.00 or absent | `qty: null`, renders red, contributes to nothing, named in the notes as requiring a plan count |
`NO RATE` | priced at $0.00 | Keep the quantity. Call it out as a budget/allowance line pending a selection -- never leave a zero unexplained |
`RATE MISMATCH` | derived rate does not round to the printed one | Look at it. Usually a penny of rounding; anything larger is a real data problem |
`UNMAPPED` | subdivision not in the trade map | Extend the map and re-run. Never ship a dropped line |

ProEst carries stray catalog rows (a `26.05338 BOXES` line at 0.00 EA with no price, for
instance). They are real lines in the report, so they carry through red with a note rather
than being quietly deleted -- deleting is Matt's call, not the script's.

## Notes & Clarifications

Written in estimator voice, for the GC. The rules in
`generate-sow-with-pricing-and-leveling` govern; the ones this pipeline always needs:

- **Basis of quantities** -- naming the estimate number and its date, and stating that
  extended totals reconcile to it.
- **Bidding basis** -- a sub may bid one lump sum on the trade header row or price line by
  line; both roll up to the same TRADE TOTAL.
- Every `NO RATE` line, as a budget or allowance, with what releases it.
- Every `NO QUANTITY` line, and what plan count releases it.
- The 97-series exclusion text from the report, rewritten as a commercial term.
- **Markups** -- compounding, applied identically to our column and all four sub columns so
  the five totals stay comparable.

Never write how the workbook was produced or what it was converted from. The estimate number
is a basis of quantities; the conversion is not the client's business.

## Critical Rules

1. ALWAYS derive the unit rate from the report's extended total, never from the printed rate.
2. ALWAYS apply all three builder fixes -- rates in column D, `SUM()` through the ladder,
   and a finalize pass that caches results.
3. ALWAYS assert with `data_only=True` that a line extension and a TRADE TOTAL come back as
   numbers before delivering.
4. ALWAYS reconcile the workbook TOTAL against the report's grand total.
5. NEVER drop an unmapped subdivision -- extend the trade map.
6. NEVER invent a quantity or a rate. Zero means red and a note.
7. ALWAYS render to PDF and read the pages back. An empty column D, `#VALUE!` in the sub
   columns and a clipped trade header are all invisible in the cell data.
8. ALWAYS tell Matt the Quantity Basis sheet ships hidden, not removed.

## Verification that actually catches things

After parsing, print the per-trade sum of `qty * rate` and compare each against the
corresponding division total on the report. They should agree to a cent or two of rounding.
A trade that is off by a line item's worth means a subdivision landed in the wrong block or
a wrapped description ate a line.

Then render and look. Check specifically: column D carries rates, column E carries an
extension on every priced row, no `#VALUE!` anywhere, the trade header text is not clipped
at the gutter, the red no-quantity rows show `--`, and the SOV TOTAL equals the Scope of
Work TOTAL.

## Files

- `scripts/parse_proest_pdf.py` -- ProEst unit cost report -> `sow_pricing_data.json`.
  Owns the trade map, the rate derivation and the flag reporting. Requires `pdftotext`.
- `scripts/build_sow_pricing_xlsx.py` -- the workbook builder, with fixes 1 and 2 applied.
- `scripts/finalize_workbook.py` -- caches formula results and repairs the outline setting.
  Requires LibreOffice (`soffice`).

## Process map

- `process-map.html`
- `process-map.pdf`
