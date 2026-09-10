import {cookies} from "next/headers";
import {SOURCE_SELECTION_COOKIE,readSourcePreference} from "@/lib/vision/source-selection";
import Link from "next/link";
import {SavedSourceSelection} from "../SourceSelection";
import { Sheet } from "@/components/Sheet";
import { VISION_SOURCES } from "@/lib/vision/sources";
import {SourceDirectory} from "./SourceDirectory";
import {getDb} from "@/lib/db";
import {discoverySourceHealth} from "@/lib/vision/discovery";
import "../map.css";
import "../vision.css";

export default async function VisionSources() {
  const selectedSources=readSourcePreference((await cookies()).get(SOURCE_SELECTION_COOKIE)?.value);
  const health=await discoverySourceHealth(getDb());
  return (
    <Sheet number="V-001" title="Find opportunities" bodyClass="vision-workspace"
      meta={<span>Long Island · Public planning and development records</span>}
      actions={<><Link className="btn btn--primary" href="/vision/discover">Discovery inbox</Link><Link className="btn btn--quiet" href="/vision">Back to Vision</Link></>}>
      <div className="vision-source-intro">
        <h2>Start with the public record.</h2>
        <p>The discovery inbox collects seven county and municipal sources. The directory also lists public sources that require manual review, a record request or direct contact.</p>
      </div>
      <SavedSourceSelection initialSources={selectedSources}/>
      <SourceDirectory sources={[...VISION_SOURCES]} health={health}/>
      <div className="vision-source-intro">
        <h2>Keep the source with the opportunity.</h2>
        <p>Use the specific application or agenda link when one is available. A listing
          alone does not confirm permit approval, funding, or an open bid. Record what
          still needs a check in the opportunity notes.</p>
      </div>
    </Sheet>
  );
}
