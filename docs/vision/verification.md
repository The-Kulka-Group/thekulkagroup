# Vision verification

The first check covers LA-205, LA-206, and LA-207. The discovery extension below
covers LA-218 and LA-219.
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

## First build limits

No production migration or deployment ran. The shipped migration contains no
records. The preview database is disposable and resets when its server restarts.
The source directory requires manual review and capture. It does not monitor
sources, extract applications, or promise complete permit coverage. There is
no automatic CRM or underwriting conversion in this slice.

## Discovery extension

The extended module passes 70 tests across six files: the original 47 checks,
12 source-adapter checks and 11 discovery API checks. These exercise bounded
source requests, schema drift, missing dates and coordinates, duplicate IDs,
oversized responses, malformed results, capture history, stale review rejection,
concurrent acceptance, preserved notes, retained dismissals, expired leases,
five-minute collection limits and authentication. Cron tests reject absent,
short, incorrect and multibyte credentials. All databases are disposable.

Lint, TypeScript and the final production build pass. The child worktree's build
first stopped because Turbopack rejected its dependency symlink. The integration
worktree uses installed dependencies and its build passed.

The browser collected 300 actual Nassau source records into the local test
database. A reviewer saved zoning referral 83126 with test notes. The saved
opportunity retained its official source link and coordinates after reload,
kept the referral date labeled in notes, and appeared on the map. A second
record was dismissed and remained available under the Dismissed filter.

The Standards review found a missing Daylight status treatment and a stale
filter-response risk. The Spec review found that removing the final record on
page two could show a false empty state. The fixes add glyph pills, guard list
responses and clamp the current page. The browser reproduced the page boundary
with 21 records matching "meadow"; dismissing the last record returned to a
populated page one with 20 records. The Spec reviewer confirmed the fix.

Desktop at 1440px and mobile at 375px were inspected. Mobile page width matched
the 375px viewport, and source review, search and dismissal remained usable.
The temporary viewport override was reset. A final server restart clears the
test review decisions before collecting a fresh local inbox.

Collection now runs from Check source or the protected scheduled endpoint.
Production migration, deployment and schedule activation have not run. Other
directory sources remain manual, and the Nassau scan covers the selection
described in discovery.md rather than every county record.

## Discovery filters

LA-220 adds application type, location and source-date filters before the server
result limit. The discovery API suite now passes 14 tests, including inclusive
date bounds, unknown dates, combined filters, invalid ranges and an older match
beyond the first 500 source records. Lint and TypeScript pass.

Browser checks at desktop and 375px confirmed type and location selection,
complete date entry, unknown dates, disabled date bounds and Clear filters.
Zoning referrals in Valley Stream from August 1 through August 31, 2026 returned
one record. Minor subdivisions with unknown dates returned 100 records. Clearing
the filters restored the 300-record inbox. The viewport override was reset.

The filter addition changes no schema or production settings.
