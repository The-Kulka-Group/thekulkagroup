# Underwriting browser check

Use this manual release check after the underwriting migrations and deployment complete. Never create synthetic records in production for a browser check.

## Production target

Record the production URL, deployment commit, tester, and test time before starting. Open the protected production `/underwriting` route in a browser. If no authorized live project exists, verify the empty list and the new-project form without saving a record. Run tests that need saved sample values in a disposable local test database or preview environment, then remove them before the check ends.

## Desktop check

Use a 1440 by 900 viewport.

1. Open the new-project screen.
2. Confirm that the form starts empty and contains no suggested names, addresses, dates, sources, or financial values.
3. Confirm that construction duration and hold period say that they are record only.
4. If an authorized live project exists, open it without changing its values.
5. Confirm that each project fact and financial assumption shows its stored source evidence and review state.
6. Confirm that the result table and model limits match the saved formula version.
7. Open a calculation from Calculation history and confirm that its results, inputs, evidence, and issues remain readable.
8. Confirm that the browser check did not create or change a production record.

## Mobile check

Repeat the list, intake, project, and run-detail checks at a 375 by 812 viewport.

Confirm that the rail becomes a scrolling top bar, the sheet remains readable, each form control has a visible or screen-reader label, result tables scroll inside the sheet, attention rows stay readable, and no control or text clips outside the page.

## Keyboard and screen-reader check

1. Move through the project form with the Tab key.
2. Confirm that each value, source label, source date, and review state announces the assumption name and control purpose.
3. Submit one invalid value. Confirm that focus remains usable and the control announces the linked error text.
4. Follow each run-history link and return to the project without using a pointer.
