import type { DiscoveredRecord } from "@/lib/vision/discovery-source";

export function SourceEvidence({record}:{record:DiscoveredRecord}) {
  if (!record.evidence?.length) return null;
  return <details className="discovery-evidence"><summary>Document evidence ({record.evidence.length} {record.evidence.length===1?"page":"pages"})</summary>
    <p className="t-meta">Text comes from the public document. Check the linked page for layout and context.</p>
    {record.evidence.map((page,index)=><article key={`${page.url}:${page.checksum}:${page.page}:${index}`}>
      <h3><a href={`${page.url.split("#")[0]}#page=${page.page}`} target="_blank" rel="noopener noreferrer">{page.title}, page {page.page}</a></h3>
      <p className="t-meta discovery-checksum">Document version: {page.checksum}</p>
      <pre className="discovery-page-text">{page.text}</pre>
    </article>)}
  </details>;
}
