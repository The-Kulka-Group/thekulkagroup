import Link from "next/link";
import { StatusBlock } from "@/components/Status";
import type { VisionOpportunity } from "@/lib/vision/types";
import type { Workflow } from "@/lib/vision/workflow-types";
import { visionDate, visionToday, WORKFLOW_LABELS } from "@/lib/vision/presentation";

export function OpportunityList({ opportunities, filtered = false, workflows }: { opportunities: VisionOpportunity[]; filtered?: boolean; workflows?: Record<string, Pick<Workflow,"decision"|"classification"|"nextAction"|"reviewDate">> }) {
  if (!opportunities.length) return <div className="empty"><p>{filtered ? "No opportunities match these filters." : "You have not saved any opportunities yet."}</p><p><Link href="/vision/sources">Find a source</Link> or <Link href="/vision/new">save an opportunity</Link> to begin tracking it.</p></div>;
  return <div className="vision-board-wrap"><table className="vision-board"><thead><tr>
    <th>Opportunity</th><th>Location</th><th>Source</th><th>{workflows ? "Decision and next action" : "Review status"}</th><th className="right">Updated</th>
  </tr></thead><tbody>{opportunities.map(opportunity => <tr key={opportunity.id}>
    <td><Link href={`/vision/${opportunity.id}`}>{opportunity.name}</Link><span className="vision-cell-meta">{opportunity.sheetNumber}</span></td>
    <td>{opportunity.town}, {opportunity.county}<span className="vision-cell-meta">{opportunity.latitude === null ? "Coordinates have not been added." : "Coordinates are saved."}</span></td>
    <td><a href={opportunity.sourceUrl} target="_blank" rel="noopener noreferrer">{opportunity.sourceTitle}</a><span className="vision-cell-meta">{opportunity.sourceDate ? visionDate(opportunity.sourceDate) : "The source date is unknown."}</span></td>
    <td>{workflows ? <><strong>{WORKFLOW_LABELS[workflows[opportunity.id]?.decision ?? "undecided"]}</strong>{workflows[opportunity.id]?.classification === "policy" ? <span className="vision-cell-meta">Policy context</span> : null}{workflows[opportunity.id]?.nextAction ? <><span className="vision-cell-meta">{workflows[opportunity.id].nextAction!.title}</span><span className="vision-cell-meta">{workflows[opportunity.id].nextAction!.assigneeEmail}</span><span className={`vision-cell-meta ${workflows[opportunity.id].nextAction!.dueDate && workflows[opportunity.id].nextAction!.dueDate! < visionToday() ? "vision-due-alert" : ""}`}>{workflows[opportunity.id].nextAction!.dueDate ? `${workflows[opportunity.id].nextAction!.dueDate! < visionToday() ? "Overdue · " : "Due "}${visionDate(workflows[opportunity.id].nextAction!.dueDate!)}` : "No due date"}</span></> : ["pursuing","watching"].includes(workflows[opportunity.id]?.decision ?? "") ? <span className="vision-cell-meta">No next action</span> : null}{workflows[opportunity.id]?.reviewDate ? <span className="vision-cell-meta">Review {visionDate(workflows[opportunity.id].reviewDate!)}</span> : null}</> : <StatusBlock status={opportunity.status}/>}</td><td className="right num">{visionDate(opportunity.updatedAt)}</td>
  </tr>)}</tbody></table></div>;
}
