# Vision source selection

LA-242 defines the workflow. LA-243 tracks this build.

The map, discovery inbox and source directory share a source selection for this
browser. Nassau applications and Suffolk planning documents start selected.
A user can choose either, both, or neither. The selection controls discoveries;
it never hides a saved opportunity or deletes source records.

Turning a source on does not collect new records. Check selected sources runs
the existing collectors only when requested. Each source keeps its own last
check, coverage, running state and error. A failed check must not prevent the
other source from completing or remove records already collected.

The combined inbox labels each record with its source and uses a stable order
before pagination. Source choices do not reset the other filters. A direct
record link may show a record from a hidden source without changing the saved
source selection.

The source directory distinguishes collection from manual review. Manual
sources retain an Open source link and do not get a switch that implies an
unbuilt collector. These preferences apply to the current browser, not every
member of the workspace.

Production access, schedules and source coverage limits remain unchanged.
