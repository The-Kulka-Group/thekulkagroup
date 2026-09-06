# Vision verification

This check covers LA-205, LA-206, and LA-207 in the first Vision build.
The test session ran on September 5, 2026, Eastern time.

## Automated checks

The Vision API, authentication policy, authentication server, and rail suites
pass: 47 tests across four files. They cover source validation, coordinate pairs,
date validation, create/read/update, filters, sheet-number search, invalid IDs,
unauthorized requests, temporary-session write rejection, database constraints,
and stale revision conflicts. Lint, TypeScript, and the production build pass.

An early broad baseline run was stopped when it competed with the focused
tests. A repeat focused run then exceeded the database setup hook's 10-second
limit. The Vision file now initializes one disposable database with a 60-second
setup limit and resets its records between cases. The final focused run passed
all 47 tests. This is not a claim that the full underwriting suite was rerun.

The browser initially failed to open the disposable database because Next
bundled PGlite's local asset URLs. Keeping PGlite external in the server build
fixed that failure. The production database code still uses Postgres.

## Browser checks

The local preview ran on port 3193 with `KULKA_BROWSER_TEST=1`. That mode uses
an in-memory Postgres instance, applies migrations there, and supplies the
existing test identity. It does not use Kulka's production database.

The original prototype was recovered from BLDG Vision commit `c29c767` into
a temporary directory and viewed before the redesign.

The new interface passed these checks:

- The empty Vision page renders the map, filters, and capture actions.
- The source directory renders four official source entries and prefills
  source title and URL when starting an opportunity.
- A clearly labeled synthetic record can be saved without coordinates and
  reopened after a full browser reload.
- Coordinates, notes, and review status can be added later. A second reload
  preserves them.
- Search for `V-101`, county Suffolk, and status Working on it returns the
  same record in the list and on the map.
- The map marker includes a state glyph and an accessible status label.
  Enter opens the matching record.
- At 375px, the record and filters use one column. The page is 375px wide;
  the 790px table scrolls inside its 317px container. Map attribution remains
  visible. Desktop and mobile screens were inspected visually.
- Blocking the tile host produces a visible map-load notice. The list still
  opens the saved record. The network block and viewport override were reset.

## Review

The Standards review found that map status depended on color. The Spec review
found that search omitted sheet numbers. Both reviewers confirmed their fixes.
The browser also caught missing keyboard activation on the marker; the fix
passed the repeated browser check.

## Limits

No production migration or deployment ran. The shipped migration contains no
records. The preview database is disposable and resets when its server restarts.
The source directory requires manual review and capture. It does not monitor
sources, extract applications, or promise complete permit coverage. There is
no automatic CRM or underwriting conversion in this slice.
