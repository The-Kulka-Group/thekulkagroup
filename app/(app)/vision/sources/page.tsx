import {cookies} from "next/headers";
import {SOURCE_SELECTION_COOKIE,readSourcePreference} from "@/lib/vision/source-selection";
import Link from "next/link";
import {SourceBrand} from "../SourceBrand";
import {SavedSourceSelection} from "../SourceSelection";
import { Sheet } from "@/components/Sheet";
import { VISION_SOURCES } from "@/lib/vision/sources";
import "../map.css";

export default async function VisionSources() {
  const selectedSources=readSourcePreference((await cookies()).get(SOURCE_SELECTION_COOKIE)?.value);
  return (
    <Sheet number="V-001" title="Find opportunities"
      meta={<span>Long Island · Public planning and development records</span>}
      actions={<><Link className="btn btn--primary" href="/vision/discover">Discovery inbox</Link><Link className="btn btn--quiet" href="/vision">Back to Vision</Link></>}>
      <div className="vision-source-intro">
        <h2>Start with the public record.</h2>
        <p>Open a source, find a construction or development application, and save the
          opportunity with the document link and date. The discovery inbox collects county planning records and Nassau and Suffolk IDA project filings. Other sources require manual capture.</p>
      </div>
      <SavedSourceSelection initialSources={selectedSources}/>
      <div className="vision-source-grid">
        {VISION_SOURCES.map((source) => {
          const query = new URLSearchParams({ sourceTitle: source.name, sourceUrl: source.url });
          return (
            <article className="vision-directory-card" key={source.id}>
              <p className="t-meta">{source.place} · {source.kind}</p>
              <h2><SourceBrand id={source.id} name={source.name}/></h2>
              <p>{source.description}</p>
              <p className="t-meta">We checked this link on {new Intl.DateTimeFormat("en-US", {month:"long",day:"numeric",year:"numeric",timeZone:"UTC"}).format(new Date(source.checkedAt))}.</p>
              <div className="vision-source-actions">
                <a className="btn btn--primary" href={source.url} target="_blank" rel="noopener noreferrer">Open source</a>
                <Link className="btn btn--quiet" href={`/vision/new?${query}`}>Add an opportunity</Link>
              </div>
            </article>
          );
        })}
      </div>
      <div className="vision-source-intro">
        <h2>Keep the source with the opportunity.</h2>
        <p>Use the specific application or agenda link when one is available. A listing
          alone does not confirm permit approval, funding, or an open bid. Record what
          still needs a check in the opportunity notes.</p>
      </div>
    </Sheet>
  );
}
