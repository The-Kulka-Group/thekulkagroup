# Hydraulic jack type: in-ground, holeless or roped

Researched 2026-09-28 for the open item "Hydraulic Well Hole and Casing" under item 26
(`docs/precon/canonical-work-items.md`, which notes that the intake does not ask in-ground or
holeless). This file answers when a hydraulic elevator in a 3 to 6 story multifamily building
needs a drilled well hole, and proposes a rule the app could use to decide. Everything here is
a proposal for Matt to confirm. Kulka AI states planning assumptions only. It does not read
drawings or perform takeoffs.

Manufacturer planning guides carry the travel, stop and pit figures. Code text carries the
buried cylinder rules. We found no published cost for a well hole, so cost has to come from
Kulka's own jobs or sub quotes.

## Short answer

A well hole is needed when the job is hydraulic and the travel is past what an above-ground
(holeless) jack reaches. Holeless jacks reach about 34 feet with a standard 4-foot pit and 44 to
50 feet with a deeper pit and more overhead. In-ground jacks reach 60 feet. So a hydraulic
building of four stories rarely needs a hole, five stories can go either way, and six stories
almost always needs one unless the elevator is roped hydraulic. Wet ground and a sole-source
aquifer push owners toward holeless where it fits, but they do not change what holeless can
reach.

## 1. Travel and stop limits by jack type

| Jack type | Max travel | Max stops | Capacity | Pit | Source |
| --- | --- | --- | --- | --- | --- |
| In-ground (holed), one cylinder in a drilled hole | 60 ft | 7 | 2,000 to 5,000 lb | 4'-0" | Otis planning guide (2008/2010) |
| In-ground ("below-ground jack") | 60'-0" | not stated | 2,100 to 5,000 lb | 4'-0" | TK Elevator endura brochure (2023) |
| Holeless single-stage | 20 ft | 3 | 2,000 to 5,000 lb | 4'-0", growing 1" per 1" of rise past 13'-7" | Otis (2008/2010) |
| Holeless single-stage, twinpost | 12'-8" standard; 18'-11" with more pit or overhead | not stated | 2,100 to 5,000 lb | 4'-0" to 5'-0" | TK Elevator (2023) |
| Holeless two-stage, twinpost | 23'-2½" standard; 28'-6" extended | not stated | 2,100 to 5,000 lb | 4'-0" to 5'-0" | TK Elevator (2023) |
| Holeless two-stage, dual jack | about 26 ft | not stated | 2,000 to 5,000 lb | 4'-0" | Nidec (Canton) Freedom Dual Holeless Two Stage page |
| Holeless telescopic | 44 ft 1 in (34'-4" with a 4'-0" pit) | 5 | passenger only, 2,000 to 3,500 lb | 4'-0" to 7'-6" by rise | Otis (2008/2010) |
| Holeless three-stage, twinpost | 33'-6½" standard; 48'-3½" extended; "serves up to six floors" with more pit and overhead | not stated | 2,100 to 5,000 lb | 4'-0" to 5'-0" | TK Elevator (2023) |
| Holeless telescopic | up to 50 ft | 6 | 2,100 to 5,000 lb | not stated | Schindler 330A page (read 2026) |
| Roped hydraulic (holeless, 2:1) | 70'-0" (about 90 ft in special cases) | not stated | limited to 3,000 lb | 4'-6" | Nidec (Canton) Freedom Cantilever Roped page |
| Roped holeless | shown up to about 60 ft on the selection chart | not stated | not stated | not stated | Otis selection chart (2008/2010) |

Notes from the same sources:

- TK Elevator says a 5'-0" pit is needed for extended travel. Past the standard figure, each
  inch of added travel costs 1" (one-stage), 2" (two-stage) or 3" (three-stage) of pit or
  overhead, with at most 2'-0" added to overhead. It also says max travel "can be limited by
  gross load on jack" (TK Elevator endura brochure, endnote 1).
- TK Elevator gives the standard in-ground jack hole depth as travel plus 6'-0" (endura
  brochure, below-ground table). A 52-foot run therefore needs a hole about 58 feet deep below
  the pit floor.
- Otis says a three-stage plunger "may require additional hoistway width" (Otis telescopic
  holeless page). Nidec says the dual-jack design "may require a larger hoistway width" and that
  its "material cost is typically higher" than in-ground.
- Roped hydraulic lifts the car two feet for each foot of jack travel (Nidec). It needs a
  governor, and Nidec calls for a governor access door in the overhead unless a special
  governor is used.
- TK Elevator notes that an 84-inch stretcher needs a 3,500 or 4,000 lb car with a wider door
  (endura brochure, endnote 4). The 3,000 lb cap on the Nidec roped unit may rule it out for
  the stretcher car. That last step is our reading, not a manufacturer statement.

Three current North American hydraulic lines (TK Elevator, Schindler, Otis) put holeless at 44
to 50 feet at most, and each gets there only with a deeper pit or more overhead. At the
standard 4-foot pit, holeless stops near 34 feet. Only in-ground and roped jacks reach 60 feet
or more. We found no current KONE hydraulic planning guide for the US.

### In stories

Using the travel table in `la-784-elevator-followups.md` Section 4 (10'-6" typical floor):

| Stops | Travel, 10'-6" ground floor | Travel, 15'-0" ground floor | Holeless, 4-ft pit | Holeless, deeper pit | In-ground | Roped |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | 21.0 ft | 25.5 ft | Yes (two-stage) | Yes | Yes | Yes |
| 4 | 31.5 ft | 36.0 ft | Yes at 31.5; not at 36 | Yes | Yes | Yes |
| 5 | 42.0 ft | 46.5 ft | No | Yes, near the limit | Yes | Yes |
| 6 | 52.5 ft | 57.0 ft | No | No (Schindler 50 ft is the highest) | Yes | Yes |
| 7 | 63.0 ft | 67.5 ft | No | No | No (past 60 ft) | Roped only, up to 70 ft |

A basement stop counts as a stop. A four-story building over a served cellar is five stops.

## 2. What drives in-ground versus holeless

**Travel and stops.** This is the main driver. Section 1 gives the limits. Otis's first
selection step is travel height, and its chart puts holeless at 20 feet, telescopic holeless
under 60 feet, and holed and roped at 60 feet (Otis planning guide, "Step 1: Travel Height").

**Capacity.** Otis's telescopic holeless is passenger only, up to 3,500 lb (Otis). TK
Elevator's twinpost holeless and Schindler's 330A run to 5,000 lb. Roped hydraulic (Nidec) is
limited to 3,000 lb.

**Pit depth and overhead.** In-ground jacks need a 4'-0" pit and 12'-0" to 12'-3" overhead
(Otis). Holeless telescopic needs 12'-8" to 13'-2" overhead and a pit up to 7'-6" as rise grows
(Otis). A deeper pit in wet ground adds waterproofing and dewatering cost, which the app already
prices through the site conditions gate (item 26d and the groundwater items).

**Soil, groundwater and rock.** A well hole is drilled to within half a degree of plumb (K.M.
McRae, a drilling contractor). In sand or clay, holes cave and "walk" out of plumb and may need a
casing. Groundwater calls for water-stop rings, hydraulic cement, pumping and a place to send
the water. Rock and ledge hold their shape and act as their own casing, but a hole in rock is
slow and costly to drill or widen later (Stanley Elevator, "Underground Conditions"). Otis and
Schindler both list waterfront and hazard-sensitive sites as uses for holeless (Otis holeless
pages; Schindler 330A page).

**Oil leaks and the environment.** Otis says holeless "substantially reduces risk of soil and
ground water contamination" and that in-ground cylinders carry PVC protection "to prevent
contact with underground contaminants" (Otis holed and holeless pages). Nidec says holeless
removes "the risk of ground contamination from an oil leak." Long Island draws its drinking
water from a sole-source aquifer (USGS; Suffolk County Sanitary Code Article 12, §760-1201).
Rockland County draws about 35 percent of its water from the Newark Basin bedrock aquifer
(USGS, Rockland County water-resource assessment, 2010).

**Cost.** Otis, Schindler and Nidec all say holeless avoids the cost of drilling. Nidec also
says holeless material cost is typically higher. None of them gives a number. See Section 4.

## 3. Code rules for buried cylinders

### ASME A17.1 / CSA B44

- **Corrosion protection.** A17.1 requires cylinders buried in the ground to be protected from
  corrosion due to galvanic or electrolytic action, salt water and other underground
  conditions. Current editions number this 3.18.3.8. Minnesota's amendment to A17.1-2016 makes
  the layout drawing show "the method used to comply with 3.18.3.8 (protection of cylinders
  buried in the ground)" (Minn. R. 1307.0067, subp. 11). Michigan's rule R 408.7043a amends
  3.18.3.8.2 to require that the chosen method be monitored and suit the site's conditions. We
  could not read the base A17.1 text itself, which sits behind the ASME paywall.
- **Accepted methods.** The NYC Building Code's retroactive rule for existing buried cylinders
  lists three: monitored cathodic protection, a coating that survives installation, or "a
  protective plastic casing immune to galvanic or electrolytic action, salt water, and other
  known underground conditions" (NYC Building Code 2022, Appendix K, Part IV, 4.3.3). That list
  matches the A17.1 methods as far as we can tell from secondary sources. The PVC liner Otis
  shows is the plastic-casing method.
- **Safety bulkhead or double cylinder.** A17.1 has required a safety bulkhead on buried
  cylinders since the 1970s. Colorado's rule describes cylinders without one as "typically
  installed prior to 1973" (Colorado 7 CCR 1101-8). Minnesota ties this to A17.1-2010 8.6.5.8
  (safety bulkhead) and the annual tests under 8.6.5.14 (Minn. R. 1307). A secondary summary of
  A17.1 3.18.3 says the bulkhead orifice limits car descent to between 5 and 15 ft/min. Every
  new in-ground cylinder sold today comes with this, so it adds no line item.
- **Buried piping.** A17.1-2019 also requires buried hydraulic piping to have a coating and a
  protective casing (secondary summary of the normsplash excerpt of A17.1-2019). This matters
  only if the machine room sits away from the hoistway.

### New York

- **New York State.** The Building Code of New York State, Chapter 30, adopts ASME A17.1 by
  reference (Section 3001.2 and Table 3001.3). We found no NYS amendment that restricts
  in-ground cylinders.
- **New York City.** Appendix K modifies A17.1 but we found no change to the buried cylinder
  rules for new work. The only NYC rule we found is the retroactive one above, which makes
  existing single-bottom buried cylinders be replaced with a protected double cylinder or one
  with a safety bulkhead (NYC Building Code 2022, Appendix K, 4.3.3).
- **Petroleum rules.** Federal UST rules exclude "hydraulic lift tanks" (40 CFR 280.10(b)(3)).
  New York's Petroleum Bulk Storage rule leaves "operational tank systems," which include
  "hydraulic lift tank systems," out of the tank definition (6 NYCRR 613-1.3). Hydraulic oil
  still counts as petroleum there, so a leak is a reportable spill. NYSDEC wants spills reported
  within two hours unless they are under 5 gallons and contained (NYSDEC Spill Response FAQ).
- **Suffolk County.** Article 12 of the Sanitary Code controls toxic and hazardous materials
  storage to protect the aquifer. We searched its text and found no mention of elevators or
  hydraulic systems.

**We found no rule in New York State, New York City, Nassau, Suffolk or Rockland that bans or
restricts in-ground cylinders in new buildings.** The pressure against them on Long Island is
owner and engineer preference, not code.

## 4. Cost of a well hole versus holeless

**We found no published figure for the cost of drilling and casing an elevator well hole, or
for the price gap between in-ground and holeless.** Manufacturers say only that holeless
avoids drilling cost (Otis, Schindler) and carries higher material cost (Nidec). The consumer
sites that give dollar ranges price home elevators or jack replacements, not new commercial
work, so we did not use them.

The canonical item "Hydraulic Well Hole and Casing" needs a figure from Kulka's own jobs or a
drilling or elevator sub quote. When one comes in, record it per hole and per foot of depth,
since depth is travel plus about 6 feet (TK Elevator).

## 5. Proposed decision rule

### Inputs

| Input | Where it comes from | Needed for |
| --- | --- | --- |
| Elevator type (V-1) | Already derived from building height | Rule runs only when V-1 is hydraulic |
| Stories above grade | Intake, `stories_above_grade` | Stops and travel |
| Levels below grade (yes/no) | Intake, `levels_below_grade` | Adds a stop if the elevator serves it |
| Ground floor height (tall retail or amenity floor) | Already used in the travel table, if known | Travel |
| Groundwater or poor soil (yes / no / don't know) | Intake, `site_conditions` | Confidence and the middle band |
| Elevator count | Intake, `elevator_count` | Multiplies the well hole item; does not change the type |
| New, optional: "Hydraulic jack type" (In-Ground / Holeless / Roped / Not Sure) | New question, asked only when V-1 is hydraulic | Lets Matt or the estimator override the rule |

Assumptions the rule makes (ours, not sourced):

- If the building goes below grade, the elevator serves that level. This adds one stop. The
  intake does not ask whether the elevator reaches the cellar or garage. It could.
- Travel uses the Section 4 floor-to-floor figures from `la-784-elevator-followups.md`.
- Rock is not asked. `docs/precon/rom-spec.md` excludes rock because it is rare on Long
  Island's glacial soils. Rockland and the Hudson Valley often have shallow rock, which makes
  drilling slower and dearer. Matt should decide whether rock needs its own answer for those
  jobs.

### Rule

1. If V-1 is traction, the rule does not apply. Output: not applicable.
2. Stops = stories above grade, plus one if the building goes below grade. Travel = (stops
   minus 1) x typical floor-to-floor + (ground floor minus typical).
3. **Travel up to 34 ft** (four stops or fewer at 10'-6"): holeless fits with a standard 4-foot
   pit (TK Elevator 33'-6½"; Otis 34'-4").
   - Output: **holeless**. No well hole.
   - Confidence: high if site conditions is yes (wet ground favors holeless). Medium if no or
     don't know, since some owners still buy in-ground here for its lower equipment cost.
4. **Travel over 34 ft and up to 48 ft** (five stops at 10'-6", or four stops with a tall
   ground floor): holeless reaches only with a deeper pit and more overhead (TK Elevator
   48'-3½"; Otis 44'-1"; Schindler 50 ft). In-ground reaches easily.
   - Site conditions yes: output **holeless**, low confidence. A deeper pit in wet ground costs
     more, but drilling a 45 to 55 foot hole in wet ground costs more again.
   - Site conditions no: output **in-ground**, low confidence. Both work, and the choice turns
     on owner preference and quotes.
   - Site conditions don't know: output **unknown**. Price in-ground and flag it.
5. **Travel over 48 ft and up to 60 ft** (six stops at 10'-6", or five stops with a tall ground
   floor): no holeless jack in the sources reaches this.
   - Output: **in-ground**. Well hole required. Hole depth about travel plus 6 ft.
   - Confidence: medium. Drop to low if site conditions is yes or don't know, because a wet or
     unknown site makes roped hydraulic or MRL traction likely alternatives. Roped hydraulic is
     capped at 3,000 lb (Nidec), which may not meet the stretcher car requirement.
6. **Travel over 60 ft**: past in-ground. Only roped hydraulic (70 ft, Nidec) reaches. The V-1
   band already sends seven stories to traction, so this case should be rare.
   - Output: **roped**, low confidence, and flag that V-1 should probably be traction.
7. If the new jack-type question is answered, its answer replaces the rule's output and
   confidence becomes high.

### What the output drives

- **In-ground:** add "Hydraulic Well Hole and Casing" once per elevator, sized by depth
  (travel plus about 6 ft). Corrosion protection (PVC casing) and the safety bulkhead come with
  the cylinder and need no separate line.
- **Holeless:** no well hole. If travel is past 34 ft, note a deeper pit (up to 5'-0" per TK
  Elevator, up to 7'-6" per Otis) and more overhead, which feed pit waterproofing and the
  bulkhead height.
- **Roped:** no well hole. Note the governor and the 3,000 lb cap.
- **Unknown:** carry in-ground as the priced default and show the flag, since it is the more
  expensive case for below-grade work.

### When confidence should be low

- Travel falls between 34 and 60 feet, which is the zone where the choice is a judgment call.
- Site conditions is "don't know."
- The building goes below grade and the intake does not say whether the elevator serves that
  level.
- A tall ground floor is likely but its height is not known.
- The job is in Rockland or the Hudson Valley, where rock is possible and the intake does not
  ask about it.

## What we could not find

- The base text of ASME A17.1 3.18.3.8 and the safety bulkhead clause. ASME sells the code, and
  the free excerpts we tried did not load. The requirements above come from state rules that
  amend or cite it (Minnesota, Michigan, Colorado) and from NYC's retroactive rule.
- Any published cost for drilling and casing a well hole, or for the price gap between
  in-ground and holeless in new commercial work.
- Any New York, Long Island, Nassau, Suffolk or Rockland rule that restricts in-ground
  cylinders in new buildings. We found none. Absence in our search is not proof none exists.
- A current Otis hydraulic planning guide. The Otis figures come from the 2008/2010 guide on
  Sweets. A current KONE US hydraulic planning guide.
- Stop limits for TK Elevator's and Nidec's holeless and roped products. They give travel only.
- Published guidance from an elevator consultant or NEII on how consultants choose between
  jack types. The criteria in Section 2 come from manufacturer and contractor pages.
- Depth to rock by county for Rockland and the Hudson Valley.

## Sources

- Otis, Elevator Planning and Selection Guide (2008/2010, on Sweets), holed, holeless and
  telescopic holeless pages and selection chart:
  http://sweets.construction.com/swts_content_files/2051/1035_142000-oti_10.pdf
- TK Elevator, endura brochure (2023, 29903-2), planning tables and endnotes:
  https://www.tkelevator.com/media/usa_canada/products_4/product_brochures/endura_product_brochure.pdf
- TK Elevator, endura product page (read 2026):
  https://www.tkelevator.com/us-en/products/elevators/all-elevators/endura/
- Schindler 330A product page (read 2026):
  https://www.schindler.com/en/elevators/passenger/schindler-330a.html
- Nidec (Canton), Freedom Cantilever Roped (read 2026):
  https://moen.nidec.com/elevators/Canton-Elevator-and-Architectural-Products/Products/Hydraulic-Elevators/Freedom-Series/Freedom-Cantilever-Roped
- Nidec (Canton), Freedom Dual Holeless Two Stage (read 2026):
  https://moen.nidec.com/elevators/Canton-Elevator-and-Architectural-Products/Products/Hydraulic-Elevators/Freedom-Series/Freedom-Dual-Holeless-Two-Stage
- Stanley Elevator, "Underground Conditions" (read 2026):
  https://www.stanleyelevator.com/hydraulic-jack-replacement/underground-conditions/
- K.M. McRae Inc., new elevator jack holes (read 2026):
  https://www.kmmcraeinc.com/contract-drilling-services/new-elevator-jack-holes/
- NYC Building Code 2022, Appendix K, retroactive requirements, 4.3.3 (via UpCodes):
  https://up.codes/s/retroactive-requirements-for-existing-elevators-and-escalators
- NYC Building Code 2022, Appendix K, modified industry standards (via UpCodes):
  https://up.codes/viewer/new_york_city/nyc-building-code-2022/chapter/K/modified-industry-standards-for-elevators-and-conveying-systems
- Building Code of New York State 2020, Chapter 30:
  https://codes.iccsafe.org/content/NYSBC2020P1/chapter-30-elevators-and-conveying-systems
- Minnesota Rules 1307.0067, amendments to ASME A17.1/CSA B44-2016:
  https://www.revisor.mn.gov/rules/1307.0067/
- Minnesota DOLI, Chapter 1307 (A17.1-2010 references, 8.6.5.8 and 8.6.5.14):
  http://www.doli.state.mn.us/sites/default/files/pdf/elev_1307.pdf
- Michigan Admin. Code R 408.7043a, cylinders buried in the ground:
  https://www.law.cornell.edu/regulations/michigan/Mich-Admin-Code-R-408-7043a
- Colorado 7 CCR 1101-8, elevator rules (buried cylinders without safety bulkhead):
  https://www.sos.state.co.us/CCR/GenerateRulePdf.do?ruleVersionId=5036
- ASME A17.1-2019 excerpt, 3.18.3 (secondary summary; the file did not load for direct reading):
  https://www.normsplash.com/Samples/ASME/116919916/ASME-A17.1-2019-en-2.pdf
- 40 CFR 280.10, UST applicability (hydraulic lift tanks excluded):
  https://www.ecfr.gov/current/title-40/chapter-I/subchapter-I/part-280/subpart-A/section-280.10
- 6 NYCRR Part 613, Petroleum Bulk Storage (2023), definitions:
  https://dec.ny.gov/sites/default/files/2024-01/part613.pdf
- NYSDEC, Spill Response and Remediation FAQ:
  https://dec.ny.gov/environmental-protection/site-cleanup/chemical-petroleum-spills/response-remediation-faq
- Suffolk County Sanitary Code, Article 12:
  https://suffolkcountyny.gov/Portals/0/FormsDocs/Health/EnvironmentalQuality/Article%2012%20Suffolk%20County%20Sanitary%20Code.pdf
- USGS, Long Island sole-source aquifer:
  https://www.usgs.gov/centers/new-york-water-science-center/science/groundwater-sustainability-long-island-aquifer-system
- USGS, Rockland County water-resource assessment (Heisig, SIR 2010-5245):
  https://pubs.usgs.gov/publication/sir20105245
- Kulka AI, `docs/precon/research/la-784-elevator-followups.md` (travel table, V-1 band).
