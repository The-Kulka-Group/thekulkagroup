import Link from "next/link";
import { Sheet, Sep } from "@/components/Sheet";
import { authorizeRequest } from "@/lib/auth/server";
import { listWorkflowSummaries } from "@/lib/vision/workflow";
import { getDb } from "@/lib/db";
import { discoveryInbox } from "@/lib/vision/discovery";
import { parseDiscoveryFilters } from "@/lib/vision/discovery-filters";
import { STATUS_LABEL } from "@/lib/data";
import { listVisionCounties, listVisionOpportunities } from "@/lib/vision/opportunities";
import { InvalidVisionInput, parseVisionFilters } from "@/lib/vision/input";
import type { VisionFilters } from "@/lib/vision/types";
import { OpportunityList } from "./OpportunityList";
import { OpportunityMap } from "./OpportunityMap";
import "./vision.css";

export const dynamic = "force-dynamic";
export default async function VisionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supplied = await searchParams;
  const params = new URLSearchParams();
  for (const [key,value] of Object.entries(supplied)) if (typeof value === "string") params.set(key,value);
  let filters: VisionFilters = {};
  let error: string | undefined;
  try { filters = parseVisionFilters(params); } catch (cause) { if (cause instanceof InvalidVisionInput) error = cause.message; else throw cause; }
  let discoveryFilters = parseDiscoveryFilters(new URLSearchParams());
  let discoveryError: string | undefined;
  try { discoveryFilters = parseDiscoveryFilters(params); } catch (cause) { if (cause instanceof InvalidVisionInput) discoveryError = cause.message; else throw cause; }
  const discoveryFiltered = Boolean(discoveryFilters.applicationType || discoveryFilters.location || discoveryFilters.dateMode !== "all" || discoveryFilters.from || discoveryFilters.to);
  const [saved,counties,discovery] = await Promise.all([listVisionOpportunities(getDb(), filters),listVisionCounties(getDb()),discoveryInbox(getDb(), "new", discoveryFilters)]);
  const opportunities = error ? [] : saved;
  const candidates = discoveryError ? [] : discovery.candidates;
  const auth = await authorizeRequest();
  const workflowRows = auth.ok && !auth.user.temporary ? await listWorkflowSummaries(getDb(),opportunities.map(item=>item.id)) : undefined;
  const workflows = workflowRows ? Object.fromEntries(workflowRows.map(item=>[item.opportunityId,{decision:item.decision,classification:item.classification,nextAction:item.nextAction,reviewDate:item.reviewDate}])) : undefined;
  return <Sheet number="V-100" title="Vision" actions={<><Link className="btn btn--quiet" href="/vision/discover">Discover opportunities</Link><Link className="btn btn--primary" href="/vision/new">New opportunity</Link></>}
    meta={<><span>Construction and development opportunities</span><Sep /><span className="num">{candidates.length} discoveries shown · {opportunities.length} tracked opportunities shown</span></>}>
    <form className="vision-map-filters" action="/vision" key={params.toString()}>
      <fieldset className="vision-filter-group"><legend>Discoveries awaiting review</legend><div className="vision-filters">
        <label>Application type<select className="input" name="applicationType" defaultValue={params.get("applicationType") ?? ""}><option value="">All application types</option>{discovery.applicationTypes.map(type => <option key={type}>{type}</option>)}</select></label>
        <label>Location<input className="input" type="search" name="location" maxLength={400} defaultValue={params.get("location") ?? ""} placeholder="Town, county or address" /></label>
        <label>Source dates<select className="input" name="dateMode" defaultValue={params.get("dateMode") || "all"}><option value="all">All dates</option><option value="known">Known dates</option><option value="unknown">Unknown dates</option></select></label>
        <label>From<input className="input" type="date" name="from" defaultValue={params.get("from") ?? ""} /></label>
        <label>Through<input className="input" type="date" name="to" defaultValue={params.get("to") ?? ""} /></label>
      </div><p className="t-meta">Dates refer to filing or referral. Clear both date bounds to find records with unknown dates.</p></fieldset>
      <details className="vision-tracked-filters" open={Boolean(filters.search || filters.county || filters.status || error)}><summary>Tracked opportunity filters</summary><div className="vision-filters">
      <label>Search<input className="input" type="search" name="search" maxLength={200} defaultValue={filters.search} placeholder="Name, place, source or notes" /></label>
      <label>County<select className="input" name="county" defaultValue={filters.county ?? ""}><option value="">All counties</option>{counties.map(county => <option key={county}>{county}</option>)}</select></label>
      <label>Tracked review status<select className="input" name="status" defaultValue={filters.status ?? ""}><option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div></details>
      <div className="vision-form-actions"><button className="btn" type="submit">Apply filters</button><Link className="btn btn--quiet" href="/vision">Clear filters</Link></div>
    </form>
    {error ? <p role="alert" className="input-error">{error}</p> : null}
    {discoveryError ? <p role="alert" className="input-error">{discoveryError} Discovery results are hidden until you correct the filters.</p> : candidates.length === 0 ? <p role="status" className="vision-map-notice">{discoveryFiltered ? "No discoveries match these filters. Clear or widen the filters to see more opportunities." : "There are no discoveries awaiting review. Open Discover opportunities to collect source records."}</p> : null}
    <OpportunityMap workflowDecisions={workflows ? Object.fromEntries(Object.entries(workflows).map(([id,workflow])=>[id,workflow.decision])) : undefined} opportunities={opportunities.filter(item=>workflows?.[item.id]?.classification!=="policy")} discoveries={candidates.map(item=>({id:item.id,name:item.snapshot.name,address:item.snapshot.address,latitude:item.snapshot.latitude,longitude:item.snapshot.longitude}))} />
    <h2 className="t-2">Tracked opportunities</h2>
    <OpportunityList workflows={workflows} opportunities={opportunities} filtered={Boolean(filters.search || filters.county || filters.status)} />
  </Sheet>;
}
