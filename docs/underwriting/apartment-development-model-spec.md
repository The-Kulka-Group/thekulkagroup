# Core Apartment Development Model

Linear parent: [LA-165](https://linear.app/bldg-labs/issue/LA-165/build-the-core-apartment-development-model)

## Outcome

Replace the preliminary same-period annual screen with a versioned monthly property model for ground-up apartment development. The model will schedule costs, lease units, fund uses, calculate forward sale proceeds, and report dated property returns. It will keep the existing source, review, revision, and immutable-run controls.

## Calculation Boundary

The pure engine is the main test seam. One versioned input snapshot enters. One monthly result leaves with issues, formula traces, and reconciliation checks. The engine does not read a clock, network, prompt, or database.

## Delivery Graph

1. [LA-166](https://linear.app/bldg-labs/issue/LA-166/schedule-costs-on-a-monthly-development-timeline) schedules cost lines on the monthly timeline.
2. [LA-167](https://linear.app/bldg-labs/issue/LA-167/model-apartment-lease-up-and-operating-cash-flow) adds lease-up and operating cash flow after LA-166.
3. [LA-168](https://linear.app/bldg-labs/issue/LA-168/fund-monthly-development-costs-with-equity-and-construction-debt) adds equity, debt, interest, and shortfall funding after LA-166 and LA-167.
4. [LA-169](https://linear.app/bldg-labs/issue/LA-169/calculate-sale-proceeds-and-property-returns-from-dated-cash-flow) adds sale proceeds and property returns after LA-167 and LA-168.
5. [LA-170](https://linear.app/bldg-labs/issue/LA-170/compare-apartment-scenarios-against-the-workbook-golden-case) adds scenarios and closes the benchmark gate after LA-169.

## Rules

- Calendar months and entered dates control timing.
- Cost lines carry category, amount, unit, start, end, distribution, source, date, and review state.
- Straight-line and versioned S-curve schedules must sum back to each cost line.
- Residential rent, rent adjustments, other income, vacancy, and credit loss remain separate.
- Debt uses a monthly roll-forward with opening balance, draws, interest, repayment, and closing balance.
- Sale value uses forward sale-period NOI and subtracts selling costs and debt payoff.
- XIRR uses explicit dated cash flows and returns an issue when no root exists.
- Each run stores the model version, input snapshot, results, issues, and reconciliations.
- The preliminary annual formula version and its past runs remain readable.
- The audited workbook supplies test fixtures, not Kulka assumptions or business rules.
- Daylight remains the interface rule set.

## Quality Gate

The model must pass line-distribution sums, monthly and total sources and uses, debt roll-forward, cash-flow composition, scenario isolation, and the applicable workbook golden values with stated tolerances. A failed check blocks the financial conclusion and appears as a review item.

## Later Modules

Retail, permanent debt, partnership waterfalls, promotes, and residual land value follow after this property model passes its checks.
