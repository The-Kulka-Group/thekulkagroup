import type {DiscoveredRecord} from "@/lib/vision/discovery-source";

export function SourceEvidence({record}: {record: DiscoveredRecord}) {
  if (!record.evidence?.length) return null;
  const isIndexLink = (entry: NonNullable<DiscoveredRecord["evidence"]>[number]) =>
    entry.kind === "index-link" || entry.title.startsWith("Index link:");
  const indexOnly = record.evidence.every(isIndexLink);
  const mixed = !indexOnly && record.evidence.some(isIndexLink);
  const singular = record.evidence.length === 1;
  const unit = indexOnly ? (singular ? "link" : "links") : mixed ? (singular ? "entry" : "entries") : (singular ? "page" : "pages");
  return <details className="discovery-evidence">
    <summary>{indexOnly ? "Listed documents" : "Document evidence"} ({record.evidence.length} {unit})</summary>
    <p className="t-meta">{indexOnly
      ? "The publisher lists these documents with the project. The captured titles and dates come from that list. Open a document to review its contents."
      : "Text comes from the public document. Check each linked page for layout and context. Any index links are labelled separately."}</p>
    {record.evidence.map((entry, index) => {
      const indexLink = isIndexLink(entry);
      return <article key={`${entry.url}:${entry.checksum}:${entry.page}:${index}`}>
        <h3><a href={indexLink ? entry.url : `${entry.url.split("#")[0]}#page=${entry.page}`} target="_blank" rel="noopener noreferrer">{entry.title}{indexLink ? "" : `, page ${entry.page}`}</a></h3>
        <p className="t-meta discovery-checksum">{indexLink ? "Index capture" : "Document version"}: {entry.checksum}</p>
        <pre className="discovery-page-text">{entry.text}</pre>
      </article>;
    })}
  </details>;
}
