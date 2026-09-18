# Jefferson's Ferry Building 1: ProEst conceptual budget against Autodesk buyout

Research note. Written 2026-09-15 from three files, read directly with openpyxl.

## Sources

| Short name | File | Sheets used |
|---|---|---|
| ProEst | `/Users/mattnicosia/dev/Kulka-AI/CostExports/Estimate_Unit_Costs_2026_09_15_Jeffersons_Ferry_ILNW_Building_1.xlsx` | `Sheet0` (line detail, rows 2 to 227), `Summary` (rows 1 to 15) |
| Autodesk budget | `/Users/mattnicosia/Downloads/Jeffersons Ferry - Budget Report.xlsx` | `Overview` (rows 1 to 12), `Budget Overview` (rows 1 to 186) |
| Autodesk contracts | `/Users/mattnicosia/Downloads/Jeffersons Ferry - Contract Report.xlsx` | `Overview` (rows 1 to 10), `Contract` (rows 1 to 26) |

Every row number below is a spreadsheet row in the named sheet. "r57" means row 57.

Both Autodesk files name the project on `Overview` row 2 as **Jefferson's Ferry NWILU Building 1**, created 2026-08-31 by Marchella Verdi (Kulka LLC). The ProEst export is named for **Jefferson's Ferry ILNW Building 1**. NWILU and ILNW are the same letters for the same thing, the Independent Living North West building.

---

## 1. Do the scopes match?

**Yes, both files describe the same building, and I am confident of that.** I am less confident that they cover exactly the same list of work. Three packages exist in one system with no counterpart in the other.

### Evidence that it is the same building

The ProEst quantities describe a three-storey, 15-unit building of about 22,800 gross square feet:

- Appliances 15 EA (ProEst `Sheet0` r137), kitchen cabinets and countertops 15 EA (r148), toilet accessories 15 LS (r129). Fifteen dwelling units.
- CMU fire separation wall priced at 1st, 2nd and 3rd floor (ProEst r25, r26, r27). Three storeys.
- Plumbing, HVAC, electrical, sprinkler, fire alarm and GWB ceilings all priced against 22,800 SF (ProEst r158, r163, r168, r173, r181, r102). One consistent building area.
- Trash chutes 3 EA, one per trash room (ProEst r153).

The Autodesk framing detail under Budget Code `09.0902.01.SUB` names 1st floor, 2nd floor and 3rd floor framing and densglass, plus roof trusses (Autodesk budget `Budget Overview` r63 to r76). Three storeys, same shell sequence.

### Evidence that the trade lists mostly line up

I mapped every ProEst dollar to an Autodesk Group and every Autodesk trade dollar back to a ProEst code. The mapping closes to the cent in both directions: the mapped ProEst column sums to $6,243,630.60 (ProEst `Summary` r2) and the mapped Autodesk column sums to $5,814,859.03, which is the Autodesk original budget total of $7,376,377.29 (`Budget Overview` r3) less General Conditions $942,668.00 (r4) and less Insurance and Fee $618,850.26 (r155). Nothing was left over on either side.

Four Autodesk supplier packages also confirm the split of their own budget exactly, which means the Autodesk allocations are internally clean and safe to read at Group level:

- Contract 03, RFG Electrical, allocated budget $656,865.00 (`Contract` r6) equals Division 26 $578,970.00 plus Division 28 $77,895.00 (`Budget Overview` r116, r128).
- Contract 12, Evian Construction, $553,015.00 (`Contract` r15) equals Masonry $72,675.00 plus Siding $480,340.00 (`Budget Overview` r27, r40).
- Contract 05, DDC Builders, $1,370,285.90 (`Contract` r8) equals Drywall $272,600.00 plus Metal Framing $1,097,685.90 (`Budget Overview` r55, r57).
- Contract 01, All Island Excavating, $359,280.00 (`Contract` r4) equals Sitework $279,300.00 plus Asphalt and Striping $79,980.00 (`Budget Overview` r132, r152).

### Evidence against a perfect match

Three items break the tie, and they are small in money but real in scope:

1. **ProEst prices a trash compactor and trash chutes that Autodesk has no home for.** ProEst r140 carries a One Apple Pak Model 100 trash compactor at $26,000 and r153 carries three trash chutes at $37,500, total $63,500. The Autodesk budget has no Division 11 and no Division 14, and no Group or line item in any other division names a compactor or a chute.
2. **Autodesk buys an insulation package that ProEst never priced as its own line.** Autodesk Group `0703 - Insulation` carries $87,828.90 in original budget, revised budget, original commitment and projected cost alike (`Budget Overview` r42, r43). ProEst has no insulation code. R-19 is folded into the interior framing unit rate at ProEst r101 ("Interior Framing 3 5/8 gyp ea side R-19", 2,777.34 LF at $14.00) and 2" rigid below grade sits in sitework at r192 at $20,767.25. There is no way to pull a comparable insulation number out of ProEst.
3. **Autodesk carries $5,500 of signage** (Group `1003 - Signage`, `Budget Overview` r93) with no ProEst counterpart.

### The Autodesk file is not a bigger project, but it did grow

The Autodesk revised budget of $8,442,770.61 and projected budget of $8,560,814.66 (`Budget Overview` r3) are larger than the original budget because the owner added work after award. The largest single addition is owner change 0008, Parking Lot Additions, which appears seven times across the report: General Conditions $52,000 (r7), concrete $61,870 (r23), sitework $205,596 (r134), asphalt $120,684 (r154), landscaping $99,921 (r146), electric $102,537 (r119), and general conditions plus insurance $64,260.80 (r159) with fee $32,130.40 (r175). None of that is in ProEst, and none of it is in the Autodesk original budget either. Any variance read that uses revised or projected budget will be reading added scope as estimating error.

### How confident, and what would settle it

Confident that it is the same building and substantially the same base scope. Not confident on the three mismatched packages above, and not confident that the ProEst estimate and the Autodesk original budget were drawn from the same drawing set at the same date. Three documents would settle it:

- The ProEst scope narrative or assumptions and exclusions page, which is not in the unit cost export.
- The original Autodesk GMP or contract exhibit with its own scope list, so the trash compactor, chutes, insulation and signage can be checked against it.
- A gross square foot and unit count stated by Autodesk, so the 22,800 SF and 15 units in ProEst can be checked rather than inferred.

---

## 2. Division by division

### Which "bought out" number I used, and why

I used **Orig. Commitment** (`Budget Overview` column I) as the buyout figure, not Projected Cost. Projected Cost includes $1,556,233.46 of approved change orders and $265,071.80 of reserves (`Budget Overview` r3), and most of that is owner-added scope such as the parking lot work. ProEst priced a base scope, so the base subcontract value at buyout is the only like-for-like figure. Projected Cost is shown in section 3 where it changes the reading.

**Actual Cost is not usable as a final number.** The job is 28.55% complete (`Budget Overview` r3), and Actual Cost stands at $2,542,680.14. The one exception is Division 02, which is 100% complete (`Budget Overview` r16) with an actual cost of $88,500.

### Caveat on Orig. Commitment

Seven Autodesk budget lines carry an Orig. Commitment with a blank Supplier Contract column, which means the budget was allocated to itself and no subcontract was executed. They are General Conditions (r6), Finished Carpentry (r36), Screened Balconies (r53), Appliances (r92), Signage (r94) and Window Treatments (r101), plus the Insurance and Fee codes (r157, r168). Those eight lines total $2,106,193.52, which is exactly the gap between the budget report's Orig. Commitment total of $7,043,787.10 (`Budget Overview` r3) and the contract report's Orig. Commitment total of $4,937,593.58 (`Contract` r3). Treat those figures as carried budget, not as a price from a subcontractor. Four further packages are still at Draft status: Flooring, Countertops, Insulation and Irrigation (`Contract` r21, r22, r23, r24).

### Table A: raw division codes, as each system files them

This table shows what happens if you compare the two systems on their own division numbers without any mapping. It is included to show why that comparison fails, not as an answer.

| Div | Name | ProEst | Autodesk orig. budget | Autodesk orig. commitment | ProEst vs orig. budget | ProEst vs buyout |
|---|---|---|---|---|---|---|
| 00 | General Conditions | — | $942,668 | $1,058,317 | — | — |
| 02 | Existing Conditions | $224,566 | $125,400 | $60,000 | +99,166 (+79%) | +164,566 (+274%) |
| 03 | Concrete | $422,418 | $305,122 | $302,751 | +117,295 (+38%) | +119,666 (+40%) |
| 04 | Masonry | $157,492 | $72,675 | $42,000 | +84,817 (+117%) | +115,492 (+275%) |
| 05 | Metals | $392,321 | $25,370 | $30,900 | +366,951 (+1446%) | +361,421 (+1170%) |
| 06 | Woods, Plastics & Composites | $330,711 | $125,000 | $125,000 | +205,711 (+165%) | +205,711 (+165%) |
| 07 | Thermal & Moisture Protection | $398,577 | $722,799 | $652,829 | -324,222 (-45%) | -254,252 (-39%) |
| 08 | Openings | $270,125 | $303,150 | $267,500 | -33,025 (-11%) | +2,625 (+1%) |
| 09 | Finishes | $906,256 | $1,630,580 | $1,494,899 | -724,324 (-44%) | -588,643 (-39%) |
| 10 | Specialties | $57,125 | $166,316 | $109,793 | -109,191 (-66%) | -52,668 (-48%) |
| 11 | Equipment | $86,000 | none | none | no Autodesk division | no Autodesk division |
| 12 | Furnishings | $132,500 | $135,054 | $90,692 | -2,554 (-2%) | +41,808 (+46%) |
| 14 | Conveying Systems | $37,500 | none | none | no Autodesk division | no Autodesk division |
| 21 | Fire Suppression | $250,800 | $97,900 | $93,000 | +152,900 (+156%) | +157,800 (+170%) |
| 22 | Plumbing | $592,800 | $472,500 | $489,000 | +120,300 (+25%) | +103,800 (+21%) |
| 23 | HVAC | $684,000 | $570,600 | $425,000 | +113,400 (+20%) | +259,000 (+61%) |
| 26 | Electrical | $638,400 | $578,970 | $646,005 | +59,430 (+10%) | -7,605 (-1%) |
| 28 | Fire Alarm / Safety & Security | $284,600 | $77,895 | $72,000 | +206,705 (+265%) | +212,600 (+295%) |
| 31 | Sitework | $230,438 | none | none | no Autodesk division | no Autodesk division |
| 32 | Exterior Improvements | $147,003 | $405,528 | $347,210 | -258,525 (-64%) | -200,207 (-58%) |
| 98 | Insurance & Fee | — | $618,850 | $736,892 | — | — |

ProEst figures come from the division total rows in `Sheet0`: r10, r22, r29, r41, r52, r70, r95, r123, r134, r142, r150, r155, r160, r165, r170, r175, r183, r207, r226. Autodesk figures come from the Division rows in `Budget Overview`: r4, r16, r20, r26, r29, r34, r37, r44, r54, r88, r95, r102, r105, r111, r116, r128, r131, r155.

Four divisions exist in one system only: ProEst 11 Equipment and 14 Conveying Systems have no Autodesk division, and ProEst 31 Sitework has no Autodesk division because Autodesk files all site work under 32. Autodesk 00 and 98 have no ProEst division because ProEst carries general conditions, insurance and fee on its `Summary` sheet as markups (r5, r6, r7).

The +1,446% on Division 05 is an artefact, not a finding. It happens because the two systems file the same work in different divisions.

### Table B: mapped comparison

This is the table to use. Each row groups the ProEst codes and the Autodesk Groups that describe the same work. Mapping notes marked M1 to M9 are listed after the table. ProEst codes cite the code total row in `Sheet0`. Autodesk Groups cite the Group row in `Budget Overview`.

| Work | ProEst source | Autodesk source | ProEst | Autodesk orig. budget | Autodesk buyout | ProEst vs orig. budget | ProEst vs buyout | Note |
|---|---|---|---|---|---|---|---|---|
| Demolition | 02 (r10) | 0201 (r17) | $224,566 | $125,400 | $60,000 | +99,166 (+79%) | +164,566 (+274%) | 100% complete, actual $88,500 |
| Concrete and site concrete | 03 (r22) | 0301 (r21) | $422,418 | $305,122 | $302,751 | +117,295 (+38%) | +119,666 (+40%) | M1 |
| Masonry and siding | 04 (r29) + 07.09510 (r69) less r65 | 0401 + 0702 (r27, r40) | $313,617 | $553,015 | $477,000 | -239,398 (-43%) | -163,383 (-34%) | M2 |
| Screened balconies | 07.09510 screen line (r65) | 0803 (r52) | $30,224 | $85,500 | $85,500 | -55,276 (-65%) | -55,276 (-65%) | M2 |
| Roofing and gutters | 07.03000 + 07.06600 (r60, r63) | 0701 (r38) | $120,485 | $154,630 | $130,000 | -34,145 (-22%) | -9,515 (-7%) | |
| Insulation | none | 0703 (r42) | $0 | $87,829 | $87,829 | -87,829 (-100%) | -87,829 (-100%) | M3 |
| Cold-formed framing, sheathing, drywall | 05.04400 + 06.04001 + 07.02700 + 09.02300 (r37, r51, r56, r105) | 0901 + 0902 (r55, r57) | $1,077,202 | $1,370,286 | $1,227,080 | -293,084 (-21%) | -149,878 (-12%) | M4 |
| Railings and metal stairs | 05.03200 + 05.05100 (r33, r40) | 0501 (r30) | $41,321 | $25,370 | $30,900 | +15,951 (+63%) | +10,421 (+34%) | M4 |
| Finish carpentry | 06.02000 (r48) | 0601 (r35) | $231,711 | $125,000 | $125,000 | +106,711 (+85%) | +106,711 (+85%) | |
| Doors, frames, hardware | 08.01100 + 08.01400 + 08.01500 + 08.03000 (r75, r80, r84, r89) | 0801 (r45) | $238,625 | $128,250 | $93,000 | +110,375 (+86%) | +145,625 (+157%) | |
| Windows | 08.05000 (r94) | 0802 (r50) | $31,500 | $89,400 | $88,999.92 | -57,900 (-65%) | -57,500 (-65%) | |
| Painting | 09.09100 (r122) | 0903 (r84) | $138,432 | $74,000 | $81,525 | +64,432 (+87%) | +56,907 (+70%) | |
| Flooring and tile | 09.03013 + 09.06000 (r110, r117) | 0904 (r86) | $227,151 | $186,294 | $186,294 | +40,857 (+22%) | +40,857 (+22%) | |
| Acoustical ceilings | 09.00951 (r99) | none | $5,214 | $0 | $0 | +5,214 | +5,214 | M5 |
| Specialties, shelving, shower doors | 10 (r134) | 1001 (r89) | $57,125 | $80,023 | $23,500 | -22,899 (-29%) | +33,625 (+143%) | M6 |
| Signage | none | 1003 (r93) | $0 | $5,500 | $5,500 | -5,500 (-100%) | -5,500 (-100%) | |
| Appliances | 11.03100 (r138) | 1002 (r91) | $60,000 | $80,793 | $80,793 | -20,793 (-26%) | -20,793 (-26%) | |
| Cabinets and countertops | 12.03800 (r149) | 1201 (r96) | $97,500 | $120,862 | $76,500 | -23,362 (-19%) | +21,000 (+27%) | |
| Window treatments | 12.02000 (r146) | 1202 (r100) | $35,000 | $14,192 | $14,192 | +20,808 (+147%) | +20,808 (+147%) | |
| Trash compactor and trash chutes | 11.08200 + 14.09000 (r141, r154) | none | $63,500 | $0 | $0 | +63,500 | +63,500 | M7 |
| Fire sprinkler | 21 (r160) | 2101 (r103) | $250,800 | $97,900 | $93,000 | +152,900 (+156%) | +157,800 (+170%) | |
| Plumbing | 22 (r165) | 2201 (r106) | $592,800 | $472,500 | $489,000 | +120,300 (+25%) | +103,800 (+21%) | |
| HVAC | 23 (r170) | 2301 (r112) | $684,000 | $570,600 | $425,000 | +113,400 (+20%) | +259,000 (+61%) | |
| Electrical | 26 (r175) | 2601 (r117) | $638,400 | $511,965 | $480,000 | +126,435 (+25%) | +158,400 (+33%) | |
| Fire alarm | 28.04600 (r182) | 2801 (r129) | $159,600 | $77,895 | $72,000 | +81,705 (+105%) | +87,600 (+122%) | |
| Nurse call and low voltage | 28.00000 (r179) | 2602 (r124) | $125,000 | $67,005 | $166,005 | +57,995 (+87%) | -41,005 (-25%) | M8 |
| Sitework, landscaping, asphalt | 31 + 32 (r207, r226) | 3201 + 3202 + 3203 (r132, r144, r152) | $377,441 | $405,528 | $347,210 | -28,087 (-7%) | +30,231 (+9%) | M9 |
| **Total trade cost** | | | **$6,243,631** | **$5,814,859** | **$5,248,578** | **+428,772 (+7.4%)** | **+995,052 (+19.0%)** | |

### Table C: the markups

ProEst puts general conditions, insurance and fee on its `Summary` sheet. Autodesk puts them in Divisions 00 and 98.

| Item | ProEst | Autodesk orig. budget | Variance |
|---|---|---|---|
| General conditions | $1,065,475.00 (`Summary` r5) | $942,668.00 (`Budget Overview` r4) | +122,807 (+13%) |
| Insurance | $262,374.51 at 3.5% (`Summary` r6) | $390,000.00 (`Budget Overview` r156) | -127,625 (-33%) |
| Fee | $310,351.56 at 4.0% (`Summary` r7) | $228,850.26 (`Budget Overview` r167) | +81,501 (+36%) |
| Insurance and fee combined | $572,726.07 | $618,850.26 (`Budget Overview` r155) | -46,124 (-7%) |
| Budget contingency | $187,308.92 at 3.0% (`Summary` r4) | no contingency line exists | not in the Autodesk file |

### A note on the $7,309,105.60 figure

A previous read held that ProEst base cost plus general conditions, $6,243,630.60 plus $1,065,475.00 equals $7,309,105.60, sits 0.9% under the Autodesk original budget of $7,376,377.29. The arithmetic is right and the comparison is wrong. The Autodesk $7,376,377.29 includes $618,850.26 of insurance and fee (`Budget Overview` r155). The ProEst $7,309,105.60 excludes insurance, fee and contingency. Comparing them puts $618,850 of Autodesk markup against nothing on the ProEst side, and that near-miss is the reason the two look like they agree. Compared correctly:

- Trade cost against trade cost: ProEst $6,243,630.60 against Autodesk $5,814,859.03. ProEst is **7.4% high**.
- Full estimate against full budget: ProEst total estimate $8,069,140.59 (`Summary` r8) against Autodesk original budget $7,376,377.29. ProEst is **9.4% high**. Strip the 3% contingency, which Autodesk does not carry, and ProEst is 6.9% high.
- Trade cost against actual buyout: ProEst $6,243,630.60 against Autodesk $5,248,578.33. ProEst is **19.0% high**.

---

## 3. Where the conceptual budget was wrong, and by how much

The headline is that the ProEst estimate was 7.4% high on trade cost against the award budget and 19.0% high against what the trades were actually bought out for. That total is not the story. It hides a $652,735 overestimate on mechanical, electrical and plumbing that is partly cancelled by a $513,866 underestimate on the building envelope and shell. Kulka's conceptual budgeting is not uniformly conservative. It is high in one place and low in another, and the two nearly cancel.

### The largest single problem: square foot allowances on MEP, sprinkler and fire alarm

ProEst prices plumbing, HVAC, electrical, sprinkler and fire alarm as flat dollars per square foot on 22,800 SF, plus a lump sum nurse call allowance. Those six lines total $2,450,600, which is 39% of the whole ProEst base cost. Autodesk budgeted $1,797,865 for the same six and bought them out for $1,725,004.59. **ProEst is $652,735 high against budget and $725,595 high against buyout.**

| Trade | ProEst rate | ProEst | Buyout | Buyout rate | ProEst over |
|---|---|---|---|---|---|
| Fire sprinkler (`Sheet0` r158) | $11.00/SF | $250,800 | $93,000 | $4.08/SF | +170% |
| Fire alarm (`Sheet0` r181) | $7.00/SF | $159,600 | $72,000 | $3.16/SF | +122% |
| HVAC (`Sheet0` r168) | $30.00/SF | $684,000 | $425,000 | $18.64/SF | +61% |
| Electrical (`Sheet0` r173) | $28.00/SF | $638,400 | $480,000 | $21.05/SF | +33% |
| Plumbing (`Sheet0` r163) | $26.00/SF | $592,800 | $489,000 | $21.45/SF | +21% |
| Nurse call (`Sheet0` r178) | $125,000 lump | $125,000 | $166,005 | | -25% |

Sprinkler and fire alarm are the two worst rates in the whole estimate. ProEst carries fire sprinkler at $11.00 per square foot and the package was bought from KG Mechanical for $93,000 (`Contract` r5), which is $4.08 per square foot. Fire alarm is priced at $7.00 and sits inside the RFG package at $72,000, which is $3.16. Neither of these rates is close.

The caution on this block is that the work is early. Plumbing is 33.55% complete, HVAC 32.63%, electrical 20.88%, fire alarm 7.90% (`Budget Overview` r105, r111, r116, r128). Buyout can still move. But sprinkler and fire alarm are both fixed-price subcontracts with no change orders recorded, so those two variances are firm.

### The second problem, in the other direction: the shell and envelope were underestimated

| Work | ProEst | Autodesk buyout | ProEst short by |
|---|---|---|---|
| Cold-formed framing, sheathing, drywall | $1,077,202 | $1,227,080 | -$149,878 |
| Masonry and siding | $313,617 | $477,000 | -$163,383 |
| Windows | $31,500 | $88,999.92 | -$57,500 |
| Screened balconies | $30,224 | $85,500 | -$55,276 |
| Insulation | $0 | $87,829 | -$87,829 |
| **Subtotal** | **$1,452,543** | **$1,966,409** | **-$513,866** |

Two of these are worth naming.

**Windows.** ProEst priced 54 window openings at $583 each on average: 9 single hung at $450, 24 mulled twins at $575, 21 mulled triples at $650 (`Sheet0` r91, r92, r93). Kulka bought Pella (`Contract` r14) for $88,999.92, which is $1,648 per opening. The estimate assumed vinyl and the job bought a brand. This is a specification gap, not a pricing error.

**The shell framing package.** This is the row where the two systems disagree most about where work lives, and it is also where the job has gone furthest off budget. ProEst carries $1,077,202 across four codes. Autodesk budgeted $1,370,286 across Drywall and Metal Framing and bought it out at $1,227,080, so the conceptual number was 12% light against buyout. Then the package fell apart. DDC Builders was awarded $380,780 (`Contract` r8), Global Contracting Concepts was later brought in on a contract with zero allocated budget and $131,200 of commitment plus $236,448 of change orders (`Contract` r16), and MS Drywall was brought in on another contract with zero allocated budget and $451,000 of commitment (`Contract` r17). Projected cost for the two Groups is now $2,082,021 (`Budget Overview` r55, r57). ProEst is 48% under that.

That last figure is a buyout failure, not an estimating failure, and it should not be used to grade the conceptual budget. The right read is the 12% shortfall against buyout.

### Demolition is the cleanest and largest percentage miss

Division 02 is 100% complete (`Budget Overview` r16). The final number is known. Cherokee Contracting was awarded $60,000 (`Contract` r7), took a $28,500 change order for steel demolition of the structure, and finished at an actual cost of $88,500.

ProEst carried $224,565.52 (`Sheet0` r10): $25,000 for site demolition as a lump (r4) plus $199,565.52 for building demolition priced at 151,186 cubic feet, $1.00 per cubic foot for the demolition and $0.32 per cubic foot for hand work (r7, r8).

**ProEst was $136,065.52 over the final cost, which is 154% high.** The cubic foot rate is the problem. This is the only trade on the job where a conceptual rate can be checked against a closed number, and it failed by more than two and a half times.

### Finish carpentry, doors and painting

Three interior packages are consistently high, and all three are priced by quantity takeoff rather than by allowance, which makes the pattern worth noting.

- **Finish carpentry** $231,711 against $125,000 budgeted and carried (`Sheet0` r48, `Budget Overview` r35). ProEst is 85% high. The estimate prices 5,235.81 LF of casement moulding, 1,508.40 LF of crown, 6,212.00 LF of base and 5,364.42 LF of chair rail (`Sheet0` r44 to r47). Either the lengths or the installed rates are wrong.
- **Doors, frames and hardware** $238,625 against $128,250 budgeted and $93,000 bought (`Budget Overview` r45). ProEst is 157% over buyout. Hardware alone is $93,750 in ProEst (r84). Unified Door and Hardware was awarded $93,000 for the doors, the frames and the hardware together (`Contract` r18).
- **Painting** $138,432 against $74,000 budgeted and $81,525 bought from Color Brite (`Contract` r25). ProEst is 70% high.

### Where the conceptual budget is already reliable

Four rows land close enough to trust:

- **Sitework, landscaping and asphalt**: ProEst $377,441 against $405,528 budgeted and $347,210 bought. Within 9% of buyout, and Autodesk's sitework group is 77.27% complete (`Budget Overview` r132), so the number is well tested.
- **Roofing and gutters**: ProEst $120,485 against $130,000 bought from Demy Construction (`Contract` r11). Within 7%.
- **Flooring and tile**: ProEst $227,151 against $186,294 bought from Sterling Floor Designs. 22% high, and the contract is still Draft (`Contract` r21).
- **Insurance and fee combined**: ProEst $572,726 against $618,850. Within 7.5%, although the two components are wrong in opposite directions by about $100,000 each. ProEst's 3.5% insurance rate is too low and its 4% fee is too high compared to how the job was actually set up.

Concrete is the near miss. ProEst carried $422,418 against $302,751 bought, which is 40% high, but see mapping note M1 before acting on that number.

---

## 4. Mapping judgment calls

Each of these is a place where I decided that a ProEst line and an Autodesk Group describe the same work. None of them is stated in either file. A reader who disagrees with one of these should reread the affected row in Table B.

**M1, concrete.** ProEst Division 03 includes two lines that may not belong with the Fiorini concrete contract: "Cast-In-Place Concrete - on Deck" at 18,000 SF for $180,000 (`Sheet0` r17) and "Gypcrete 3000psi" at 15,200 SF for $68,400 (r20). The deck pour is probably the concrete half of the composite slab whose steel half ProEst prices separately at r36, and on the Autodesk side that assembly sits inside the DDC framing package, not inside the concrete contract. Gypcrete has no Autodesk line at all. If both are removed from ProEst Division 03, the concrete comparison flips from 40% high to 43% low: $174,018 against a $302,751 buyout. I left both in Division 03 because that is where ProEst filed them, but the concrete row in Table B should not be used to draw a conclusion until someone confirms who poured the deck and who placed the gypcrete.

**M2, masonry, siding and screened balconies.** Autodesk splits Evian Construction's single $553,015 contract across Masonry and Siding. ProEst splits similar work across Division 04 masonry and code 07.09510 Siding. Within ProEst's siding code, the line "Screen Enclosure System" at $30,224.10 (`Sheet0` r65) is not siding, and I moved it to face Autodesk's Screened Balconies group. That is my call, not the file's.

**M3, insulation.** I show ProEst at $0 against Autodesk's $87,828.90. ProEst does carry insulation, but only inside a composite framing rate (`Sheet0` r101) and inside a below-grade sitework line (r192). Neither can be separated cleanly. Showing $0 overstates the gap on that row, and the framing row above it understates by the same amount.

**M4, cold-formed framing versus structural steel.** This is the biggest mapping decision in the note. Autodesk's Metal Framing group lists four supplier contracts including "Structural Steel and Misc Steel" (`Budget Overview` r58), which means part of Summit Structural Builders' work is filed in Division 09 and part in Division 05. The Summit contract carries $295,000 of original commitment (`Contract` r13) while Autodesk Division 05 shows only $30,900 (`Budget Overview` r29), so $264,100 of Summit's work sits in Division 09. On the ProEst side, cold-formed panel, shear wall and comslab decking are in Division 05 (`Sheet0` r35, r36), wood trusses are in Division 06 (r50), densdeck sheathing is in Division 07 (r55), and interior framing and drywall are in Division 09 (r101 to r104). I merged all of that against Autodesk Groups 0901 and 0902, and left only railings and metal stairs facing Autodesk 0501. The merged row is defensible. The "Railings and metal stairs" row is not, because Autodesk 0501 still holds some Summit steel that ProEst may have priced inside its cold-formed lines.

**M5, acoustical ceilings.** ProEst carries $5,214.09 of 2x2 acoustical tile (`Sheet0` r98). Autodesk has no ceiling group. It is most likely inside the drywall package. The amount is small enough to ignore.

**M6, specialties.** ProEst Division 10 holds stainless corner guards, toilet accessories and storage gates (`Sheet0` r126, r129, r132). Autodesk Group 1001 is "Specialties, Shelving, Shower Doors" and its supplier is Clear Image Storefronts and Glass (`Contract` r26). These are not the same list of items. The row is a placeholder so that both columns balance, not a real comparison.

**M7, trash compactor and chutes.** No Autodesk counterpart exists. I show $0 rather than guessing a home for them.

**M8, nurse call and low voltage.** ProEst carries a $125,000 nurse call allowance under Division 28 (`Sheet0` r178). Autodesk has no nurse call line and I mapped it to Group 2602 Low Voltage. Autodesk's low voltage history is messy: RFG took a $58,000 scope credit (`Budget Overview` r127), a vendor change added $30,749.69 (r126), and North Atlantic Communications now holds $108,004.59 (`Contract` r20). The two may not describe the same system.

**M9, sitework.** ProEst splits site work across Division 31 and Division 32. Autodesk puts everything in Division 32. I merged both ProEst divisions against the three Autodesk groups. One oddity worth flagging: Autodesk's Irrigation contract carries a negative original allocated budget of -$99,921 (`Contract` r24), which offsets a $99,921 landscaping addition booked to Fiorini (`Budget Overview` r146). The Fiorini contract's $451,291.50 allocation (`Contract` r9) equals concrete $305,122.50 plus landscaping $46,248.00 plus that $99,921. Autodesk's landscaping group therefore shows $0 of original commitment (`Budget Overview` r144) despite having $46,248 of budget.

---

## 5. What I could not determine

**Whether the two files price the same drawing set.** The ProEst export carries no date, revision, or drawing reference on either sheet. The Autodesk reports are dated 2026-08-31 and describe a job that is 28.55% complete. If the ProEst estimate is conceptual and the Autodesk budget is a bought GMP, some of the variance is design development, not estimating error, and nothing in these three files separates the two. **What would settle it:** the drawing issue date the ProEst estimate was priced from, and the GMP date.

**Whether the trash compactor, trash chutes, insulation and signage were in the contract.** These four packages exist in one system and not the other. **What would settle it:** the contract scope exhibit.

**Whether ProEst's $22,800 SF matches Autodesk's building area.** Six ProEst lines depend on it and the MEP finding rests on it. No Autodesk file states a square footage. **What would settle it:** a gross area from the project record.

**The final cost of anything except demolition.** Only Division 02 is 100% complete. Division 03 is 85.78% and Division 04 is 90.25% (`Budget Overview` r20, r26), and everything else is under 65%. The MEP figures in section 3 are buyout values, not final values, and they will move. **What would settle it:** the same two reports rerun at closeout.

**Who poured the concrete deck and who placed the gypcrete.** See M1. This one is worth chasing, because it swings the concrete verdict from 40% high to 43% low. **What would settle it:** the Fiorini and DDC subcontract scope sheets.

**Whether the ProEst general conditions figure is comparable.** ProEst shows $1,065,475 as a single line with no backup (`Summary` r5). Autodesk shows $942,668 as Division 00 with nine change order lines under it, seven of them weather delays (`Budget Overview` r9 to r15). The 13% variance may reflect duration assumptions rather than rates, and neither file shows a schedule. **What would settle it:** the general conditions buildup behind the ProEst lump and the assumed job duration behind each.
