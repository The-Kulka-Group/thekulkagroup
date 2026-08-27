import { FIXTURE_PROJECT_ID } from "@/lib/rom/fixture";

import { RomRunner } from "./RomRunner";

// The walking skeleton's surface (LA-12): trigger a ROM for the fixture project
// and read the line that comes back. The tier-1 question flow arrives with
// LA-17, so there is nothing to answer here yet.
export default function RomPage() {
  return <RomRunner projectId={FIXTURE_PROJECT_ID} />;
}
