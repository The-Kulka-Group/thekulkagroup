import Link from "next/link";
import { StatusBlock } from "@/components/Status";
import type { VisionOpportunity } from "@/lib/vision/types";
import type { Workflow } from "@/lib/vision/workflow-types";
import { WorkflowDecision } from "./WorkflowDecision";
import { visionDate, visionToday } from "@/lib/vision/presentation";

export function OpportunityList({ opportunities, filtered = false, workflows }: { opportunities: VisionOpportunity[]; filtered?: boolean; workflows?: Record<string, Pick<Workflow,"decision"|"classification"|"nextAction"|"reviewDate">> }) {
  if (!opportunities.length) return <div className="empty"><p>{filtered ? "No opportunities match these filters." : "You have not saved any opportunities yet."}</p><div className="vision-empty-actions"><Link className="btn btn--quiet" href="/vision/sources">Find a Source</Link><Link className="btn btn--primary" href="/vision/new">Save an Opportunity</Link></div></div>;
  return <div className="vision-board-wrap"><table className="vision-board"><thead><tr>
    <th>Opportunity</th><th>Location</th><th>Source</th><th>{workflows ? "Decision and Next Action" : "Review Status"}</th><th className="right">Updated</th>
  </tr></thead><tbody>{opportunities.map(opportunity => <tr key={opportunity.id}>
    <td><Link className="vision-link-pill" href={`/vision/${opportunity.id}`}>{opportunity.name}</Link><span className="vision-cell-meta">{opportunity.sheetNumber}</span></td>
    <td>{opportunity.town}, {opportunity.county}<span className="vision-cell-meta">{opportunity.latitude === null ? "Coordinates have not been added." : "Coordinates are saved."}</span></td>
    <td><a className="vision-link-pill" href={opportunity.sourceUrl} target="_blank" rel="noopener noreferrer">{opportunity.sourceTitle}</a><span className="vision-cell-meta">{opportunity.sourceDate ? visionDate(opportunity.sourceDate) : "The source date is unknown."}</span></td>
    <td>{workflows ? <><WorkflowDecision decision={workflows[opportunity.id]?.decision ?? "undecided"}/>{workflows[opportunity.id]?.classification === "policy" ? <span className="vision-cell-meta">Policy Context</span> : null}{workflows[opportunity.id]?.nextAction ? <><span className="vision-cell-meta">{workflows[opportunity.id].nextAction!.title}</span><span className="vision-cell-meta">{workflows[opportunity.id].nextAction!.assigneeEmail}</span><span className="vision-cell-meta">{workflows[opportunity.id].nextAction!.dueDate && workflows[opportunity.id].nextAction!.dueDate! < visionToday() ? <span className="status-block status-block--stuck">Overdue</span> : null}{workflows[opportunity.id].nextAction!.dueDate ? `Due ${visionDate(workflows[opportunity.id].nextAction!.dueDate!)}` : "No Due Date"}</span></> : ["pursuing","watching"].includes(workflows[opportunity.id]?.decision ?? "") ? <span className="vision-cell-meta">No Next Action</span> : null}{workflows[opportunity.id]?.reviewDate ? <span className="vision-cell-meta">Review {visionDate(workflows[opportunity.id].reviewDate!)}</span> : null}</> : <StatusBlock status={opportunity.status}/>}</td><td className="right num">{visionDate(opportunity.updatedAt)}</td>
  </tr>)}</tbody></table></div>;
}
