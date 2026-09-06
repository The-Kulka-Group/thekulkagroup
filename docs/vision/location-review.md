# Vision location review

LA-238 defines the location review workflow. LA-240 tracks the build.

A saved opportunity needs both latitude and longitude to appear on the map.
A town name alone does not locate a project. A missing pin must leave the
record available in the list, with a link to resolve its location.

Address lookup uses the [Census geocoder](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html).
The service returns approximate street-address matches. A match does not
verify a parcel or the extent of a development site. Lookup must not save a
location. The reviewer inspects the proposal, adjusts it if needed, then
confirms it. An address change clears the proposed pin while leaving the
saved location intact until confirmation.

The location update changes only the address and coordinates. It checks the
opportunity revision so that a stale editor cannot overwrite newer work.
Notes, review status, contacts, actions and linked source records remain
separate. Clearing a pin must not delete the opportunity. Both lookup and
location changes require the existing Vision writer authorization.

## Source used for the local check

On September 6, 2026, the linked Suffolk staff report for Motor Parkway
Associates LLC listed parcel `0504 00100 0100 010000` and described the site as
the southwest corner of Veterans Memorial Highway and Motor Parkway.

The [county parcel point](https://gis.suffolkcountyny.gov/server/rest/services/LocalGovernmentSQLData/TaxParcelOwnerPoint/MapServer/0/query?where=PARCELID%3D%270504001000100010000%27&outFields=PARCELID%2COWNERNAME&returnGeometry=true&outSR=4326&f=pjson)
returned that parcel ID, owner `MOTOR PARKWAY ASSOCIATES LLC`, latitude
`40.81153565577642` and longitude `-73.18993628903974` in WGS 84.
This point provides a location for that parcel, not the boundary of all land
in the application. The linked report identifies additional parcels as well.

The source is the [June 3 staff report](https://www.suffolkcountyny.gov/Portals/0/formsdocs/planning/scplanningcommission/2026/Z-4%20Staff%20Report%20Is-26-02MotorParkwayAssociatesLLC.pdf#page=1).
The report's file-number conflict remains unresolved; matching a parcel does
not resolve that separate source-identity issue.

No production data or access settings are part of this build.

## Verification on September 6, 2026

All 93 Vision tests passed. Typecheck, lint and the final production build
passed. The standards review found stale pristine source forms and off-scale
styles; both were fixed and passed a second review. The spec review found no
remaining gap.

The local browser check used a separate in-memory database on port 3194.
It collected 300 Nassau records and 50 Suffolk records, then linked the two
Motor Parkway filings to one saved opportunity. It confirmed the county parcel
point above and verified that the saved pin appeared on the main map and
remained visible on the detail page after reload.

A Census lookup for a known public address returned a suggestion without
writing it to the opportunity. The intersection lookup returned no matches
and preserved the saved pin. Clearing the pin left the opportunity in the
list and exposed its resolve-location link. Confirmation restored the pin.

A pristine source form accepted a notes save after a location change. A dirty
notes form kept its draft across a location save and received HTTP 409 on a
stale submission. The saved notes, review status and source link remained
unchanged. The test draft was discarded without saving it.

The saved-location layout fit a 375px viewport without horizontal overflow.
The viewport override was reset after the check. These checks prove the local
build; production remains on the earlier release.
