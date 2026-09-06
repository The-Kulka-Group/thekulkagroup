import Link from "next/link";
import { Sheet, Sep } from "@/components/Sheet";
import { getDb } from "@/lib/db";
import { discoveryInbox } from "@/lib/vision/discovery";
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
  const [opportunities,counties,discovery] = await Promise.all([listVisionOpportunities(getDb(), filters),listVisionCounties(getDb()),discoveryInbox(getDb())]);
  return <Sheet number="V-100" title="Vision" actions={<><Link className="btn btn--quiet" href="/vision/discover">Discover opportunities</Link><Link className="btn btn--primary" href="/vision/new">New opportunity</Link></>}
    meta={<><span>Construction and development opportunities</span><Sep /><span className="num">{discovery.candidates.length} discoveries awaiting review · {opportunities.length} tracked opportunities shown</span></>}>
    <form className="vision-filters" action="/vision">
      <label>Search<input className="input" type="search" name="search" maxLength={200} defaultValue={filters.search} placeholder="Name, place, source or notes" /></label>
      <label>County<select className="input" name="county" defaultValue={filters.county ?? ""}><option value="">All counties</option>{counties.map(county => <option key={county}>{county}</option>)}</select></label>
      <label>Tracked review status<select className="input" name="status" defaultValue={filters.status ?? ""}><option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button className="btn" type="submit">Apply filters</button><Link className="btn btn--quiet" href="/vision">Clear filters</Link>
    </form>
    {error ? <p role="alert" className="input-error">{error}</p> : null}
    <OpportunityMap opportunities={opportunities} discoveries={discovery.candidates.map(item=>({id:item.id,name:item.snapshot.name,address:item.snapshot.address,latitude:item.snapshot.latitude,longitude:item.snapshot.longitude}))} />
    <h2 className="t-2">Tracked opportunities</h2>
    <OpportunityList opportunities={opportunities} filtered={Boolean(filters.search || filters.county || filters.status)} />
  </Sheet>;
}
