import Link from "next/link";
import { notFound } from "next/navigation";
import { Sheet, Sep } from "@/components/Sheet";
import { OpportunityWorkflow } from "./OpportunityWorkflow";
import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { isUuid } from "@/lib/uuid";
import { getVisionOpportunity } from "@/lib/vision/opportunities";
import { visionDate } from "@/lib/vision/presentation";
import { OpportunityForm } from "../OpportunityForm";
import "../vision.css";

export const dynamic = "force-dynamic";
export default async function OpportunityPage({ params }: { params: Promise<{id:string}> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const opportunity = await getVisionOpportunity(getDb(),id);
  if (!opportunity) notFound();
  const auth = await authorizeRequest();
  return <Sheet number={opportunity.sheetNumber} title={opportunity.name} actions={<Link className="btn btn--quiet" href="/vision">All opportunities</Link>}
    meta={<><span>Updated {visionDate(opportunity.updatedAt)}</span><Sep /><span>{opportunity.town}, {opportunity.county}</span></>}>
    {auth.ok && !auth.user.temporary ? <><OpportunityWorkflow opportunity={opportunity} viewerEmail={auth.user.email}/><details className="wf-source-edit"><summary>Edit source details and original notes</summary><OpportunityForm key={id} opportunity={opportunity} hideReviewStatus/></details></> : <><section className="vision-source"><h2 className="t-2">Source</h2><a href={opportunity.sourceUrl} target="_blank" rel="noopener noreferrer">{opportunity.sourceTitle}</a><p className="vision-source-url">{opportunity.sourceUrl}</p><p className="t-meta">{opportunity.sourceDate ? `Published ${visionDate(opportunity.sourceDate)}.` : "The publication date is unknown."} This record preserves the source context entered by the user.</p></section>
    <section className="vision-form"><p>Sign in with an authorized account to edit this opportunity.</p><h2 className="t-2">Location</h2><p>{opportunity.address || "The address is unknown."}</p><p>{opportunity.latitude === null ? "Coordinates have not been added." : `${opportunity.latitude}, ${opportunity.longitude}`}</p><h2 className="t-2">Notes</h2><p className="vision-read-notes">{opportunity.notes || "No notes have been saved."}</p></section></>}
  </Sheet>;
}
