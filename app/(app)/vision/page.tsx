import {cookies} from "next/headers";
import {SOURCE_SELECTION_COOKIE,readSourcePreference} from "@/lib/vision/source-selection";
import Link from "next/link";
import { Sheet, Sep } from "@/components/Sheet";
import { authorizeRequest } from "@/lib/auth/server";
import { listWorkflowSummaries } from "@/lib/vision/workflow";
import { getDb } from "@/lib/db";
import {DISCOVERY_SOURCES} from "@/lib/vision/discovery-catalog";
import { selectedDiscoveryInbox } from "@/lib/vision/selected-discovery";
import { SavedSourceSelection } from "./SourceSelection";
import { parseDiscoveryFilters } from "@/lib/vision/discovery-filters";
import { STATUS_LABEL } from "@/lib/data";
import { listVisionCounties, listVisionOpportunities } from "@/lib/vision/opportunities";
import { InvalidVisionInput, parseVisionFilters } from "@/lib/vision/input";
import type { VisionFilters } from "@/lib/vision/types";
import { OpportunityList } from "./OpportunityList";
import { OpportunityMap } from "./OpportunityMap";
import { AutoSubmitSelect } from "./AutoSubmitSelect";
import { DiscoveryFilterDisclosure } from "./DiscoveryFilterDisclosure";
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
  const discoveryFilterCount = ["applicationType","location","from","to"].filter(key=>Boolean(params.get(key))).length + (params.get("dateMode") && params.get("dateMode") !== "all" ? 1 : 0);
  const selectedSources=readSourcePreference((await cookies()).get(SOURCE_SELECTION_COOKIE)?.value);
  const [saved,counties,discovery] = await Promise.all([listVisionOpportunities(getDb(), filters),listVisionCounties(getDb()),selectedDiscoveryInbox(getDb(),selectedSources,"new",discoveryFilters)]);
  const opportunities = error ? [] : saved;
  const candidates = discoveryError ? [] : discovery.candidates;
  const auth = await authorizeRequest();
  const workflowRows = auth.ok ? await listWorkflowSummaries(getDb(),opportunities.map(item=>item.id)) : undefined;
  const workflows = workflowRows ? Object.fromEntries(workflowRows.map(item=>[item.opportunityId,{decision:item.decision,classification:item.classification,nextAction:item.nextAction,reviewDate:item.reviewDate}])) : undefined;
  return <Sheet number="V-100" title="Vision" bodyClass="vision-workspace" actions={<><Link className="btn btn--quiet" href="/vision/discover">Discover</Link><Link className="btn btn--primary" href="/vision/new">New opportunity</Link></>}
    meta={<><span>Construction and development opportunities</span><Sep /><span className="num">{candidates.length} discoveries shown · {opportunities.length} tracked opportunities shown</span></>}>
    <SavedSourceSelection initialSources={selectedSources}/>
    {Object.entries(discovery.sourceErrors).map(([source,message])=><p className="input-error" role="alert" key={source}>{DISCOVERY_SOURCES.find(item=>item.id===source)?.name}: {message}</p>)}
    {error ? <p role="alert" className="input-error">{error}</p> : null}
    {discoveryError ? <p role="alert" className="input-error">{discoveryError} Discovery results are hidden until you correct the filters.</p> : selectedSources.length > 0 && candidates.length === 0 ? <p role="status" className="vision-map-notice">{discoveryFiltered ? "No discoveries match these filters. Clear or widen the filters to see more opportunities." : "There are no discoveries awaiting review. Open Discover opportunities to collect source records."}</p> : null}
    <form className="vision-map-filters" action="/vision" key={params.toString()}>
      <DiscoveryFilterDisclosure activeCount={discoveryFilterCount} invalid={Boolean(discoveryError)}><fieldset className="vision-filter-group"><legend>Discoveries awaiting review</legend><div className="vision-filters">
        <label>Application type<AutoSubmitSelect className="input" name="applicationType" defaultValue={params.get("applicationType") ?? ""} aria-label="Application type, applies when selected"><option value="">All application types</option>{[...new Set([...discovery.applicationTypes,...(discoveryFilters.applicationType?[discoveryFilters.applicationType]:[])])].sort().map(type => <option key={type}>{type}</option>)}</AutoSubmitSelect></label>
        <label>Location<input className="input" type="search" name="location" maxLength={400} defaultValue={params.get("location") ?? ""} placeholder="Town, county or address" /></label>
        <label>Source dates<AutoSubmitSelect className="input" name="dateMode" defaultValue={params.get("dateMode") || "all"} aria-label="Source dates, applies when selected"><option value="all">All dates</option><option value="known">Known dates</option><option value="unknown">Unknown dates</option></AutoSubmitSelect></label>
        <label>From<input className="input" type="date" name="from" defaultValue={params.get("from") ?? ""} /></label>
        <label>Through<input className="input" type="date" name="to" defaultValue={params.get("to") ?? ""} /></label>
      </div></fieldset></DiscoveryFilterDisclosure>
      <details className="vision-tracked-filters" open={Boolean(filters.search || filters.county || filters.status || error)}><summary>Tracked opportunity filters</summary><div className="vision-filters">
      <label>Search<input className="input" type="search" name="search" maxLength={200} defaultValue={filters.search} placeholder="Name, place, source or notes" /></label>
      <label>County<AutoSubmitSelect className="input" name="county" defaultValue={filters.county ?? ""} aria-label="County, applies when selected"><option value="">All counties</option>{counties.map(county => <option key={county}>{county}</option>)}</AutoSubmitSelect></label>
      <label>Tracked review status<AutoSubmitSelect className="input" name="status" defaultValue={filters.status ?? ""} aria-label="Tracked review status, applies when selected"><option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</AutoSubmitSelect></label>
      </div></details>
      <div className="vision-filter-footer"><p>Dates use each source record’s date label. Clear both date bounds to include unknown dates. Menu choices apply at once. Use Apply text after typing.</p><div className="vision-form-actions"><button className="btn btn--secondary" type="submit">Apply text</button><Link className="btn btn--quiet" href="/vision">Clear filters</Link></div></div>
    </form>
    <OpportunityMap workflowDecisions={workflows ? Object.fromEntries(Object.entries(workflows).map(([id,workflow])=>[id,workflow.decision])) : undefined} opportunities={opportunities.filter(item=>workflows?.[item.id]?.classification!=="policy")} discoveries={candidates.map(item=>({id:item.id,name:item.snapshot.name,address:item.snapshot.address,town:item.snapshot.town,county:item.snapshot.county,latitude:item.snapshot.latitude,longitude:item.snapshot.longitude}))} />
    <h2 className="t-2">Tracked opportunities</h2>
    <OpportunityList workflows={workflows} opportunities={opportunities} filtered={Boolean(filters.search || filters.county || filters.status)} />
  </Sheet>;
}
