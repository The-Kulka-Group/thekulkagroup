# Underwriting browser check

Record this named production browser run after the underwriting migrations and deployment complete. This is a manual release check, not CI automation. The values below belong to a synthetic test case. They are not a live deal or an approved investment case.

## Production target

Record the production URL, deployment commit, tester, and test time before starting. Open the protected production `/underwriting` route in a browser.

## Desktop check

Use a 1440 by 900 viewport.

1. Open the new-case screen.
2. Create `Synthetic browser check` at `100 Example Avenue`.
3. Enter 24 proposed units, 800 SF average unit size, and 24000 GSF.
4. Enter 2500000 purchase price, 2100 monthly rent, 225 hard cost per GSF, 12 soft cost percent, 5 contingency percent, 5 vacancy percent, 32 operating expense percent, 65 debt percent, 7 interest rate percent, and 5.5 exit cap rate percent.
5. Enter `Synthetic test fixture` in the common source label field and use a visible test date in the common source date field.
6. Confirm that construction duration and hold period say that they are record only.
7. Save the case. On the case screen, confirm that each project fact and financial assumption shows the common source evidence and a Working on it review state. Reload the page and confirm that the values remain.
8. Run the calculation. Confirm that the review count and attention rows include each Working on it assumption.
9. Confirm that the result table uses `Stabilized value estimate` and `Full-balance annual interest estimate`.
10. Read the model limits. Confirm that they name annual-period capitalization, full-balance annual interest, omitted models, and the finance approval boundary.
11. Open the calculation from Calculation history. Confirm that the detail page shows every result and formula, all calculation inputs, all saved evidence fields, and all issues.
12. Return to the case, change monthly rent to 2050, and save and recalculate.
13. Confirm that both runs remain reachable and that the older run still shows 2100 in its input and evidence snapshots.
14. Open the case in a second tab. Save a change in the first tab, then try to save the stale second tab. Confirm that the second tab keeps its entered values and asks for a refresh and retry.
15. Clear one source label and source date in the edit table. Save and confirm that the missing evidence stays blank and appears in Needs your review.

## Mobile check

Repeat the list, intake, case, and run-detail checks at a 375 by 812 viewport.

Confirm that the rail becomes a scrolling top bar, the sheet remains readable, each form control has a visible or screen-reader label, result tables scroll inside the sheet, attention rows stay readable, and no control or text clips outside the page.

## Keyboard and screen-reader check

1. Move through the case form with the Tab key.
2. Confirm that each value, source label, source date, and review state announces the assumption name and control purpose.
3. Submit one invalid value. Confirm that focus remains usable and the control announces the linked error text.
4. Follow each run-history link and return to the case without using a pointer.
