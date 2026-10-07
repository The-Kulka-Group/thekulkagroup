import { Sep, Sheet } from "@/components/Sheet";
import { RoadmapView } from "./RoadmapView";
import { ROADMAP_AS_OF, WORKSTREAMS } from "./roadmap-data";
import { formatRoadmapDate } from "./roadmap-format";

export default function Roadmap() {
  return (
    <Sheet
      number="K-100"
      title="Roadmap"
      meta={
        <>
          <span>As of {formatRoadmapDate(ROADMAP_AS_OF, true)}</span>
          <Sep />
          <span>{WORKSTREAMS.length} workstreams since Aug 26</span>
        </>
      }
    >
      <RoadmapView workstreams={WORKSTREAMS} asOf={ROADMAP_AS_OF} />
    </Sheet>
  );
}
