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

## Map visibility and color

LA-221 fixes the empty map by adding the unreviewed discovery inbox as a distinct
blue layer. Tracked opportunities retain their Daylight review colors. The map
uses colored base tiles with more contrast, a taller canvas, a legend and layer
controls. Screen-based grouping preserves separate applications at one location;
popups list every member and provide a zoom action. A record link opens its
source review and scrolls it into view. Accepted and dismissed discoveries stay
out of this layer through the existing inbox query.

Sixteen tests pass across map grouping and discovery API behavior. TypeScript
and lint pass. Desktop and 375px browser checks confirmed 300 discovered records,
visible colored markers, layer hiding, keyboard cluster activation, record
navigation, mobile popup bounds and zoom regrouping. The temporary viewport was
reset. No source record was accepted as part of this visual check.

## Discovery filters on the map

LA-224 adds application type, location and source date filters to the map through
the existing validated discovery query. A GET form preserves selections in the
URL across reloads. Tracked filters remain in their own section. Invalid source
filters hide discovery results and show a correction message. Empty matches
have a separate message from records without coordinates.

Sixteen map grouping and discovery API tests pass, along with TypeScript and
lint. Browser checks confirmed one Valley Stream zoning referral in August
2026, retained filters after reload, zero markers for an empty location search,
and 100 minor subdivisions with unknown dates. Mobile controls fit at 375px
without horizontal overflow. Clear filters restores the full discovery layer.
The viewport override was reset. This change has no production settings or
schema changes.

## Saved opportunity workflow

LA-230 and LA-231 add the approved single-record workflow. An authorized staff
member can pursue, watch or pass; add or link a person; assign one next action;
and record a result with a replacement action or a closed outcome. Won requires
award evidence. Policy context stays out of the opportunity map and cannot be
pursued, won or lost. Legacy source notes, record IDs and review data remain.

The new workflow and people stores use RLS with no browser-role policies. The
server rejects temporary access to both workflow reads and writes. Revision
checks gate the state, activity and inline contact insertion in one SQL statement.
Assignees must be in the authorized staff list. Due dates use calendar dates,
and overdue display compares against America/New_York.

All 69 tests pass across workflow, legacy opportunity routes, discovery routes,
source parsing and map grouping. TypeScript, lint and the production build pass. Browser checks on the
actual HTTP app confirmed source acceptance, pursuit without a contact, saved
action/due date, inline person creation, result plus next action, reload retention,
atomic pass with a reason, action closure and existing-person linking. The mobile
375px viewport had no horizontal overflow. Desktop and mobile layouts were
inspected, and the viewport override was reset.

The Standards review found inconsistent state chips and bold overdue dates; both
now use Daylight's shared status treatment. The Spec review found a stale outcome
selection after classification changes and a missing atomic pass result. Both
paths were corrected, including outcome reset after loading a conflict revision.

The browser checks used marked temporary QA activity in the disposable local
database. The preview database was reset afterward. No QA contact, action or
outcome is included in a migration. Production schema, data and settings were not
changed. The prototype remains on its separate branch.

## Long Island municipal source directory, LA-379 through LA-384

The joined local registry represents 111 current local jurisdictions: 69 in Nassau
and 42 in Suffolk. Three separate permit sources bring the local source count to 114.
Five county-level source entries bring the directory to 119 sources. Four county
planning and IDA sources have collection adapters. The other 115 entries describe
public manual review, records requests, direct contact, or the
absence of a public project feed. These figures count jurisdictions and source
routes. They do not count projects or prove that a filing describes an active job.

The local checks validate the joined municipal lists, duplicate source IDs, source
capability fields, filters, access labels, empty results, every official link target,
representative link clicks, checked dates, and the 375px layout. This proves the code
and directory coverage in the tested commit. It does not prove that every official
site is still reachable, that
Vision collected production records from manual sources, or that this work is
deployed. No collection run, production import, migration, schedule, or deployment
is part of this check.

The full Vitest run passed 448 tests in 47 files. All 10 active Playwright tests
passed, and the separate temporary-access test stayed skipped because that setting
was off. TypeScript, lint, the production build, and the whitespace check passed.

## Suffolk collection and filing links, LA-236 and LA-237

The real HTTP collector checked the 48 linked 2026 documents and produced 50
review records. Twenty records have resolved case identities; nine records carry
policy context. These counts describe source records, not qualified opportunities.
The collector preserves all 48 canonical PDF URLs, page numbers, checksums and
embedded text. The source's current linked documents end in August; this is not
complete Suffolk permit or development coverage.

The local preview's Check source action also returned 50 records and displayed
48 documents in completed coverage. The browser saved the Motor Parkway agenda
entry, then attached its staff report to that same opportunity. Both source
records and their page evidence remained available after reload. The record
remained undecided, without contacts, assigned actions or a claimed commercial
outcome. No coordinates were added.

The opportunity and source-review pages were checked at 375px width. The document
scroll width remained 375px. Source evidence is collapsible, and opening another
record closes the previous record's expanded evidence. Linked sources stay
collapsed above the decision workflow so they do not push work controls down.

All 85 Vision tests across six files pass. They cover source selection, independent
leases, failure preservation, known and unknown identity, policy detection, wrapped
locations, original field labels, evidence history, new and existing opportunity
acceptance, concurrent retries, competing targets and retained notes/workflow.
TypeScript, ESLint and the production build pass. The Standards review's URL,
document-count and duplicate-metadata findings were fixed. The Spec review's
collection-year mismatch was fixed and has a regression test.

The local runtime uses NODE_OPTIONS=--dns-result-order=ipv4first because Node's
initial address selection timed out against the county site on this machine.
This changes the local preview process only. PDF extraction uses pdfjs-dist as
an external server package; it requires Node 22.13 or newer. The collector limits
a batch to 80 documents and 80 MB, a document to 8 MB and 120 pages, and each page
to 40,000 text characters. Requests have a 30-second timeout and one transient
retry within a 180-second batch deadline. Failed runs retain preceding data.

The new source-links migration ran only in disposable test and browser databases.
No production migration or deployment ran. No Suffolk schedule was enabled. The
preview remains an in-memory database that resets when its server restarts.
