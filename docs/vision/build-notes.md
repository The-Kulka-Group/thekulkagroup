# Kulka Vision

Matt asked to bring the Kulka Vision prototype into Kulka AI and use Daylight.
He confirmed the focus as finding and tracking construction and development
opportunities. Linear records the build in LA-205, LA-206, and LA-207.

## Prototype

The source lives in the BLDG Vision repository at commit `c29c767`, under
`demos/kulka-vision`. The files no longer exist in that repository's current
checkout. Recover them with `git archive` into a separate directory for reference.

The prototype has a Long Island map, county counts, targets, a detail panel,
relationship layers, and a pipeline tray. Its targets, dollar figures, fit
scores, past work, competitors, and permit density are invented demonstration
data. They must not become application records or migration seeds.

The new module uses the current Kulka AI frame, root `DESIGN.md`, and
`daylight.css`. It keeps the map and opportunity drill-down. It uses the app's
type, sheets, controls, and review states. The old loader, giant wordmark,
floating instruments, and decorative effects do not carry over.

## First working scope

A user opens an official source, finds a construction or development record,
and saves it with source context. The user can find that record again, review
it, keep notes, and view it on the map when coordinates are known. Missing
coordinates do not hide an opportunity from the list.

The module starts empty. Review status describes the user's work; it does not
assert that a public application has a permit, funding, or a confirmed bid
window. Source date and saved date have separate meanings. Updating notes
must not silently overwrite a more recent edit.

## Source checks

These pages were checked on September 5, 2026, Eastern time. A checked link
means the official page provides the described material. It does not mean
that all applications are current or that the module monitors the source.

| Place | Official source | What it provides |
| --- | --- | --- |
| Nassau County | [Planning Commission](https://www.nassaucountyny.gov/5697/Planning-Commission) | Hearing notices, agendas, and transcripts. |
| Nassau County | [Planning Division](https://www.nassaucountyny.gov/Planning) | A link to the zoning-referral and subdivision application viewer. |
| Huntington | [Meetings and agendas](https://huntingtonny.gov/meetings) | Meeting video, final agendas, voting history, and resolutions. |
| Smithtown | [Public meetings](https://smithtownny.portal.civicclerk.com/) | Board meeting agendas, including site-plan review. The town's [Agenda Center](https://www.smithtownny.gov/AgendaCenter) links to this portal. |

Start with these sources. Do not infer countywide permit coverage from them.
Before adding automatic ingestion, choose source documents, stable identifiers,
date handling, deduplication, update history, and the review path for extracted
claims. A source outage must remain visible rather than look like zero leads.

## Map boundary

The map uses Leaflet 1.9.4 and OpenStreetMap raster tiles. Review the
[Leaflet API](https://leafletjs.com/reference.html) and
[tile policy](https://operations.osmfoundation.org/policies/tiles/) when changing
it. Keep visible attribution, normal browser caching and referrers, and request
only the current viewport. Do not add offline download or bulk prefetch.
The saved list remains usable when tiles fail. Record text stays in Kulka AI;
the tile provider receives geographic tile requests, not source notes.

## Release boundary

This build does not deploy, run production migrations, change login settings,
import BLDG Vision data, call paid enrichment services, or send messages.
The schema runs against disposable Postgres in tests. A production release
needs a separate migration and access review. Temporary access cannot write
Vision records; the existing shared authentication policy stays intact.
