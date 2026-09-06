# Vision discovery

Matt approved automatic opportunity discovery after reviewing the first Vision
module. Linear records this work in LA-218 and LA-219. It extends draft PR #11.

## Coverage

The first collector uses the public application service linked by the official
[Nassau Planning page](https://www.nassaucountyny.gov/Planning). The county's
[map configuration](https://nassau-county.maps.arcgis.com/sharing/rest/content/items/c254807646764e19810dc347a510fc4e/data?f=json)
identifies the [planning service](https://services1.arcgis.com/rsOafHhKLHpnpr4t/arcgis/rest/services/NCPC_Cases_Map/FeatureServer).

Each check requests the 100 highest OBJECTIDs in each of three layers: zoning
referrals, major subdivisions and minor subdivisions. This bounded scan collects
up to 300 records. It does not establish date-based coverage, active bids, or
complete county coverage. Older records can appear, and zoning referrals can
concern policy changes. Records outside this selection do not receive updates.
Other sources in the directory still require manual review.

The county supplies GlobalID for each record. Vision combines the layer number
and GlobalID for identity, and keeps a link that queries that GlobalID. A new
address or source OBJECTID therefore does not create a second copy. Separate
applications at one address remain separate records.

## Source context

Zoning records carry a referral date. Major subdivisions can carry an initial
filing date and a source-reported approval date. Minor subdivisions have no date
field. Dates remain unknown when the source leaves them empty. ArcGIS declares
UTC dates in epoch milliseconds; Vision preserves the UTC calendar day.

These dates do not stand for publication dates. Saving a discovery keeps the
labeled date in the notes, and leaves the opportunity publication date blank.
Review status describes the user's work and never derives from a source approval
field. Coordinates come from the county with output spatial reference 4326;
Vision checks their ranges and leaves missing points blank.

## Collection limits

The collector makes three requests to fixed public URLs. Each request has a
15-second timeout, a one-megabyte response limit, and a 100-record limit.
Redirects fail. Malformed or empty layers fail the check and keep earlier finds.
The source's transfer-limit flag is expected for this explicit 100-record
selection; Vision does not claim that it traversed the full source.

The inbox keeps source snapshots separate from saved opportunities. A reviewer
must choose to track a find. Source refreshes do not overwrite their saved notes
or review status. Dismissed records stay dismissed when collected again.

## Release boundary

This build adds schema and a scheduled collection endpoint, but does not apply a
production migration or enable a production schedule. The local preview uses a
disposable database. Public records collected there disappear on server restart.
Release requires the schema, an authorized account, a protected scheduler and
live verification under separate production approval.

For an approved release, configure a random `VISION_DISCOVERY_CRON_SECRET` of at
least 32 characters in server and scheduler secrets. The scheduler sends POST to
`/api/vision/discovery/cron` with `Authorization: Bearer <secret>`. Use a daily
schedule; this build does not configure one. A five-minute database lease and
check interval cover both manual and scheduled collection. Missing or incorrect
credentials return 401. The inbox reports the last check, last completed check,
and a failed check while retaining prior records.

## Source verification

On September 5, 2026, Eastern time, the actual adapter returned 300 records across
all three layers. Of these, 151 had no source date. The check read public records
without credentials and did not write to the county service. Parser tests use
synthetic responses that never enter application data.

## Suffolk collection and filing links

LA-236 and LA-237 extend this flow with a separately checked Suffolk source.
The source selector controls the inbox and manual check. Each source has its own
lease, cooldown, last success and error. The cron route remains Nassau-only.
Suffolk coverage records the year and every document URL in a completed check.
A failed batch leaves the preceding coverage and candidate records intact.

Suffolk PDF evidence lives in candidate snapshots and capture history. The inbox
omits page text to keep list responses small; opening a record loads its evidence.
The opportunity page exposes linked source records and their capture history.
Source dates retain their stated labels, including received and meeting dates.
Unknown coordinates remain absent.

A review can attach the candidate to an existing opportunity using its ID. The
new source-links migration removes the old one-filing-per-opportunity constraint.
The acceptance revision check prevents a stale or competing review from changing
a link. Source updates never overwrite the linked opportunity or its workflow.
Policy and unresolved document records can support an existing opportunity but
cannot create a project through this review action.

This migration requires a separate approved release before production use.
