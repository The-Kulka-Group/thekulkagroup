# Long Island source expansion

Research for LA-226, checked September 5, 2026, Eastern time. This is a source
integration plan. The new sources below are not connected collectors yet.
Long Island means Nassau and Suffolk for this release; the plan does not claim
complete coverage of every town, village, filing or permit.

## Existing coverage

The Nassau application adapter collects the 100 highest OBJECTIDs from each of
three layers. That is a bounded sample of up to 300 records, not full county
coverage or a date-based search. Huntington and Smithtown are directory links
for manual review. See [the current collector notes](../vision/discovery.md).

## Selected order

| Order | Official source | Observed material | Proposed intake and limit |
| --- | --- | --- | --- |
| 1 | [Suffolk County Planning Commission](https://www.suffolkcountyny.gov/Departments/Economic-Development-and-Planning/Planning-and-Environment/Regulatory-Review/Suffolk-County-Planning-Commission) | The 2026 index links agendas, staff reports, summaries and resolutions. | Collect the current year's linked documents with recorded coverage and versions. Extract application-level text into review. County material includes policy items and does not represent every local project. |
| 2 | [Islip Planning Board documents](https://islipny.gov/community-and-services/documents/meeting-documents-agendas-notices-resolutions/planning-board-meetings) | The document index lists public notices and agendas and links a Site Plans category. | Start with agenda text and notices, follow pagination and retain document/page references. Keep drawing attachments as links; do not interpret construction drawings or perform takeoffs. |
| 3 | [Oyster Bay Planning Advisory Board](https://oysterbaytown.com/calendars/planning-advisory-board/) | The 2026 schedule links meeting agendas and marks canceled meetings. | Add agenda collection. A sampled PDF returned no text through web extraction; establish whether text extraction or OCR works before promising an automated feed. |
| 4 | [Hempstead Board of Appeals](https://hempsteadny.gov/509/Board-of-Appeals) | The board publishes a hearing schedule and individual hearing notices. | Parse application-level HTML notices with case number and hearing date. Route minor variances and renewals for qualification so they do not look like large development opportunities. |

This order favors useful evidence across Suffolk before adding more Nassau volume.
It is an engineering choice based on the material inspected, not a ranking of
Kulka's sales territories or the number of available jobs.

## Sample evidence

The Suffolk [Estates at Elwood staff report](https://www.suffolkcountyny.gov/Portals/0/formsdocs/planning/scplanningcommission/2026/Z-1%20Staff%20Report%20HU-26-05%20Estates%20at%20Elwood.pdf)
provides file HU-26-05, a municipality, petitioner, received date, location and
parcel references on page 1. Its page 2 distinguishes a yield-map lot count from
the proposed lot count in the overview. Preserve those labels and evidence rather
than flattening them into one unsupported project-size field. This sample does
not establish current project status or an available Kulka contract.

The Suffolk [March meeting summary](https://www.suffolkcountyny.gov/Portals/0/formsdocs/planning/scplanningcommission/2026/PCMeetingSummary3-4-2026.pdf)
includes a broad redevelopment planning item. That supports keeping policy or
area-level signals separate from individual commercial opportunities.

The Oyster Bay [June 11 agenda link](https://oysterbaytown.com/wp-content/uploads/20260529113205910.pdf)
returned a one-page PDF with no extracted text in this check. The index is verified;
the suitability of that document for automated extraction is not established.

The Hempstead [August 5 hearing notice](https://www.hempsteadny.gov/1172/Hearing---08052026)
contains numbered cases, localities, descriptions and locations. The sampled
items include a special event, fence and sign renewals. A hearing notice alone
therefore cannot qualify a construction lead.

## Next collector contract: Suffolk

Discover document links from the official index. Use fixed allowed origins,
bounded request time/size, retry limits and per-source collection leases. Record
the year and successfully checked documents; do not imply coverage of documents
that failed, were missing or were not scanned. Missing agendas on a canceled
meeting are different from an unexpected parser failure.

Identity has two levels. A document has its canonical URL and content checksum;
a case has the authority, municipality and full source file identifier. A report,
agenda and later resolution can support one case while retaining separate
versions. If a document lacks a reliable case ID, retain it as an unresolved
source item rather than combining it by title. A changed URL may suggest an
existing case but must not erase old evidence.

Extract text facts with page references and the original field labels. Keep
meeting, received, filing and decision dates distinct from first-seen time.
Unknown or conflicting fields need review. The source's recommendation and the
team's sales stage remain separate. No extracted company or contact becomes an
approved CRM relationship without review.

Do not place a pin at a town center when a source lacks coordinates. A later
geocoder must record provider, precision and matched address. Ambiguous parcels,
intersection descriptions and multi-site cases remain in the list until reviewed.
The first collector can deliver valuable reviewable records without claiming
that every record is ready for the map.

Acceptance requires fixtures for repeat documents, revised reports, missing IDs,
policy items, unknown dates, conflicting facts and extraction failure. Then check
real public samples against their source pages, repeat the collection to prove
idempotency, and confirm that acceptance links to one opportunity while preserving
all evidence. A failed fetch must retain prior records and show incomplete coverage.
A source without new records must not create alerts merely to show activity.

## Later coverage

Revisit the existing Huntington and Smithtown directory entries for collection.
Research Brookhaven through its current Town Board planning workflow rather than
assuming an old Planning Board feed remains authoritative. The town's
[2026 budget](https://www.brookhavenny.gov/DocumentCenter/View/38793/Town-of-Brookhaven-2026-Adopted-Operating-Budget---Web-Version)
states that the Town Board assumed Planning Board duties in 2024. An active
calendar category alone does not prove where current application records live.

After those sources pass intake checks, inventory North Hempstead, Babylon,
Riverhead, Southampton, East Hampton, Southold, Shelter Island and independent
villages. Those are coverage gaps to research, not verified integrations.
Public procurement, IDA project records and permit datasets are later source
families with different meanings and date fields. Keep them distinct from
planning applications rather than forcing them into one undifferentiated feed.

No source researched in this job was added to a collection schedule, and no
additional records were imported into the preview or production database.
