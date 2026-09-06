# IDA discovery sources

LA-246 and LA-247 connect Nassau and Suffolk IDA to Vision's discovery and review flow. Both sources use separate manual checks, existing access rules and the five-minute source cooldown. Existing browser choices remain as saved. A browser with no preference starts with all supported sources selected.

Nassau collects the public project table and linked document metadata across up to 30 pages. The collector checks page ranges, totals and duplicate records before writing results. Names and listed addresses identify rows because the publisher supplies no project ID in this table. A changed name or address requires review before linking records. Dates are the latest listed document dates. Financial-assistance status does not establish construction progress or bid availability.

Suffolk collects named application and abstract links in the first 15 resource entries. Older archive pages and the separate hearings tab are outside this check. Document URLs identify records, so repeat meeting listings do not create another copy of the same document. Different documents from the same applicant remain separate evidence until reviewed. Dates describe the index meeting, not document publication. Site identity remains unresolved; users can review the linked filing and attach it to a verified opportunity.

These collectors capture public index metadata and document links. They do not extract the linked PDF contents. The review panel labels these as listed documents rather than captured PDF pages. Existing Suffolk planning PDF evidence retains its page labels. No new source receives invented map coordinates.

Official logos appear beside source names in the shared switches, directory, check status and discovery record labels. See [asset provenance](source-logos.md).

## Verification

The local browser collected 212 Nassau projects and 30 Suffolk filings. A Nassau project saved through the existing review form and remained tracked after its source was hidden. Switch choices persisted between the inbox, map and source directory. All logo images loaded at a 375px mobile viewport without horizontal overflow.

The test suite covers source parsing, bounded pagination, missing pages, stable refresh identity, API compatibility, source failure isolation, review preservation and source preferences. All 110 Vision tests, typecheck, lint and production build passed. Two independent reviews found no actionable issues. A final live refresh returned 212 Nassau projects and 30 Suffolk filings without source errors.

This branch does not change production data, subscriptions, schedules or access settings. It has not been merged or deployed.
