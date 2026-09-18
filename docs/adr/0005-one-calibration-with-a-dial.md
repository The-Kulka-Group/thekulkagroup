# One calibration, adjusted by a dial

The engine calibrates to one target and produces one number. The user then moves a dial to
take it up or down, and the ROM states where the dial was set. There is no second dataset
behind any dial position.

The target is award value: what the job was budgeted at when the contract was awarded. That
is what a developer is handed when they ask for a budget and what they take to a lender. On
Jefferson's Ferry that is $5,814,859 of trade cost, against a ProEst conceptual budget of
$6,243,631.

An earlier draft of this decision, written the same day, gave a ROM three settings that each
targeted a different Autodesk column: bought-out cost, award value, and forecast final cost.
That was wrong. It meant three calibrations off the same source files, so the database would
hold three benchmark sets covering the same work. They would drift apart, and no number could
say which set produced it. Traceability is the whole reason this project exists, and that
design broke it.

## Success is ten percent

A ROM is successful when its undialed output lands within ten percent of award value on a
completed job. The dial is never part of that measurement.

An earlier draft of this decision set the bar at five percent. Ten replaced it. At five,
Kulka's own ProEst conceptual budget for Jefferson's Ferry would have failed, since it came
in 7.4 percent high against award value. At ten it passes, so the tool has to match current
practice rather than beat it.

Some of that 7.4 percent is scope change and design development rather than estimating
error, and nothing in the available files separates them, so the true estimating error is
lower but unknown.

## The dial carries provenance

A dial position must never be a bare percentage that traces to nothing. It would be the one
untraceable number in a system designed around provenance, and a user nudging it twelve
percent with no stated reason is a fudge factor wearing a label.

The stops are measured instead. Across Kulka's finished jobs there is an observable gap
between award value and final cost, and another between award value and bought-out cost.
Those gaps are data, so a Conservative stop is "plus the median award-to-final gap across the
jobs behind it," cited on the face of the ROM like any other number.

Kulka has two Autodesk jobs today and both are under 31 percent complete, so those gaps
cannot be computed yet. Until they can, the stops are set by judgment and flagged as
judgment, which is the mechanism `docs/precon/rom-spec.md` already provides for estimator
rules.

## Consequences

Whether the dial should move divisions by different amounts is left open deliberately. It
almost certainly should, since on Jefferson's Ferry demolition ran 154 percent high while
sitework landed within 9 percent. A per-division dial is more machinery than two unfinished
jobs can justify. Ship it flat, measure whether the spread is uniform as jobs close, and
refine then.

The dial setting appears on the face of every ROM. The gap between the low and high ends is
wide enough that a reader mistaking one for the other is the liability risk raised in the
August 2026 call, and it happens through carelessness rather than malice.
