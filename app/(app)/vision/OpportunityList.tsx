import Link from "next/link";
import { StatusBlock } from "@/components/Status";
import type { VisionOpportunity } from "@/lib/vision/types";
import { visionDate } from "@/lib/vision/presentation";

export function OpportunityList({ opportunities }: { opportunities: VisionOpportunity[] }) {
  if (!opportunities.length) return <div className="empty"><p>No opportunities match these filters.</p><p>Find a source or save an opportunity to begin tracking it.</p></div>;
  return <div className="vision-board-wrap"><table className="vision-board"><thead><tr>
    <th>Opportunity</th><th>Location</th><th>Source</th><th>Review status</th><th className="right">Updated</th>
  </tr></thead><tbody>{opportunities.map(opportunity => <tr key={opportunity.id}>
    <td><Link href={`/vision/${opportunity.id}`}>{opportunity.name}</Link><span className="vision-cell-meta">{opportunity.sheetNumber}</span></td>
    <td>{opportunity.town}, {opportunity.county}<span className="vision-cell-meta">{opportunity.latitude === null ? "Coordinates have not been added." : "Coordinates are saved."}</span></td>
    <td><a href={opportunity.sourceUrl} target="_blank" rel="noopener noreferrer">{opportunity.sourceTitle}</a><span className="vision-cell-meta">{opportunity.sourceDate ? visionDate(opportunity.sourceDate) : "The source date is unknown."}</span></td>
    <td><StatusBlock status={opportunity.status} /></td><td className="right num">{visionDate(opportunity.updatedAt)}</td>
  </tr>)}</tbody></table></div>;
}
