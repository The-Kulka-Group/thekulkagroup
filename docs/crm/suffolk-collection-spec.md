# Suffolk discovery and evidence linking

Matt approved this build after the saved workflow, on September 5, 2026.
Linear spec LA-236 and implementation LA-237 track the work. The base is
661a32a and the change joins draft PR #11.

## Problem and result

Vision needs Suffolk evidence in the same review flow as Nassau. Several filings
may describe one opportunity. A filing must not create a second deal merely
because the county published another document.

Staff can choose Suffolk, check the current year's public meeting documents,
review page text and source links, and save a qualified record or link evidence
to an existing opportunity. New source versions retain capture history. User
notes, people, actions and sales decisions remain separate from source facts.

## Contract

The collector discovers official agenda, staff report, summary and resolution
links in the current year's index. It bounds document count, bytes and time,
uses an allowlist of official URLs and rejects failed or unreadable collections.
The last saved records remain available and coverage shows an incomplete check.
Successful checks disclose their scope. There is no new collection schedule.

A reliable case identity includes authority, municipality and full file ID.
A document's URL and checksum identify its version. Conflicting IDs and documents
without reliable case context stay unresolved. Policy context stays separate from
project opportunities. Those records may support an existing opportunity after
review, but cannot create a new project from the source-review action.

PDF text retains page numbers and original labels. Meeting and received dates
remain distinct from first-seen dates. No collector invents coordinates. There
is no OCR, drawing interpretation, takeoff or automatic contact creation.

Acceptance can create one opportunity or attach to a chosen existing record.
It uses candidate revision checks, remains idempotent under retries and rejects
a competing target. Links survive source refresh and expose capture history.
The existing notes and workflow do not change when a filing is attached.

## Verification

Use the existing database-backed API tests to cover source selection, leases,
repeat and revised records, failed checks, link retries, competing targets and
preserved notes. Use source fixtures for identity conflicts, policy text, absent
IDs, dates, evidence pages and parsing failures. Check actual public collection
and the local review UI at desktop and mobile widths.

Production release and database migration remain outside this job's authority.
