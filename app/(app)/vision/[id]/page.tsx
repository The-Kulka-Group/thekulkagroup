import Link from "next/link";
import { OpportunityLocation } from "./OpportunityLocation";
import { notFound } from "next/navigation";
import { Sheet, Sep } from "@/components/Sheet";
import { OpportunityWorkflow } from "./OpportunityWorkflow";
import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { isUuid } from "@/lib/uuid";
import { getVisionOpportunity } from "@/lib/vision/opportunities";
import { opportunityEvidence } from "@/lib/vision/discovery";
import { SourceEvidence } from "../discover/SourceEvidence";
import "../discover/discovery.css";
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
  const evidence = auth.ok ? await opportunityEvidence(getDb(),id) : [];
  return <Sheet number={opportunity.sheetNumber} title={opportunity.name} bodyClass="vision-workspace" actions={<Link className="btn btn--quiet" href="/vision">All opportunities</Link>}
    meta={<><span>Source record updated {visionDate(opportunity.updatedAt)}</span><Sep /><span>{opportunity.town}, {opportunity.county}</span></>}>
    {evidence.length?<details className="vision-source vision-linked-sources"><summary>Linked source records ({evidence.length})</summary>{evidence.map(item=><article key={item.id}><h3>{item.snapshot.name}</h3><p>{item.snapshot.sourceDateLabel}: {item.snapshot.sourceDate ? visionDate(item.snapshot.sourceDate) : "Not provided"}</p><div className="vision-inline-actions"><a className="vision-link-pill" href={item.snapshot.sourceUrl} target="_blank" rel="noopener noreferrer">Open official record</a><Link className="vision-link-pill" href={`/vision/discover?record=${item.id}`}>Review record and capture history</Link></div><SourceEvidence record={item.snapshot}/></article>)}</details>:null}
    {auth.ok ? <><OpportunityLocation key={`${id}:${opportunity.revision}`} opportunity={opportunity} sources={evidence.filter(item=>item.snapshot.address).map(item=>({address:item.snapshot.address,url:item.snapshot.sourceUrl,title:item.snapshot.name}))}/><OpportunityWorkflow opportunity={opportunity} viewerEmail={auth.user.email}/><details className="wf-source-edit"><summary>Edit source details and original notes</summary><OpportunityForm key={id} opportunity={opportunity} hideReviewStatus/></details></> : <><section className="vision-source"><h2 className="t-2">Source</h2><a className="vision-link-pill" href={opportunity.sourceUrl} target="_blank" rel="noopener noreferrer">{opportunity.sourceTitle}</a><p className="vision-source-url">{opportunity.sourceUrl}</p><p className="t-meta">{opportunity.sourceDate ? `Published ${visionDate(opportunity.sourceDate)}.` : "The publication date is unknown."} This record preserves the source context entered by the user.</p></section>
    <section className="vision-form"><p>Sign in with an authorized account to edit this opportunity.</p><h2 className="t-2">Location</h2><p>{opportunity.address || "The address is unknown."}</p><p>{opportunity.latitude === null ? "Coordinates have not been added." : `${opportunity.latitude}, ${opportunity.longitude}`}</p><h2 className="t-2">Notes</h2><p className="vision-read-notes">{opportunity.notes || "No notes have been saved."}</p></section></>}
  </Sheet>;
}
