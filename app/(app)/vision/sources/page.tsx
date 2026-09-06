import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import { VISION_SOURCES } from "@/lib/vision/sources";
import "../map.css";

export default function VisionSources() {
  return (
    <Sheet number="V-001" title="Find opportunities"
      meta={<span>Long Island · Public planning and development records</span>}
      actions={<Link className="btn btn--quiet" href="/vision">Back to Vision</Link>}>
      <div className="vision-source-intro">
        <h2>Start with the public record.</h2>
        <p>Open a source, find a construction or development application, and save the
          opportunity with the document link and date. These sources require manual review.</p>
      </div>
      <div className="vision-source-grid">
        {VISION_SOURCES.map((source) => {
          const query = new URLSearchParams({ sourceTitle: source.name, sourceUrl: source.url });
          return (
            <article className="vision-directory-card" key={source.id}>
              <p className="t-meta">{source.place} · {source.kind}</p>
              <h2>{source.name}</h2>
              <p>{source.description}</p>
              <p className="t-meta">We checked this link on September 5, 2026.</p>
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
