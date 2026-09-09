import { randomUUID } from "node:crypto";
import type { Db } from "@/lib/db";
import type { DiscoveredRecord } from "./discovery-source";
import { isUuid } from "@/lib/uuid";
import { parseVisionDraft, safeSourceUrl, InvalidVisionInput } from "./input";
import { parseDiscoveryFilters, type DiscoveryFilters } from "./discovery-filters";
import { automatedSourceDefinition, collectAutomatedSource, DEFAULT_AUTOMATED_SOURCE_ID, discoverySourceId, enabledAutomatedSourceDefinitions } from "./source-registry";

export type DiscoveryCandidate = { id:string; source_id:string; snapshot:DiscoveredRecord; revision:number; review_state:"new"|"dismissed"|"accepted"; opportunity_id:string|null; first_seen_at:string; last_seen_at:string; changed_at:string };
export type DiscoveryRunOutcome = "completed"|"completed_empty"|"skipped"|"blocked"|"failed";
export type DiscoveryState = { last_checked_at:string|null; last_success_at:string|null; last_error:string|null; last_outcome:DiscoveryRunOutcome|null; record_count:number; coverage:{year:number;documents:string[]}|null; running:boolean };
export type DiscoveryRunResult = {sourceId:string;outcome:DiscoveryRunOutcome;count:number;coverage:{year:number;documents:string[]}|null;fetched:number;inserted:number;updated:number;unchanged:number;rejected:number;error:string|null};
export class DiscoveryConflict extends Error {}
class DiscoverySourceFailure extends Error {}
export { DISCOVERY_SOURCE_IDS, discoverySourceId } from "./source-registry";
export async function discoveryInbox(db:Db, state="new", filters:DiscoveryFilters=parseDiscoveryFilters(new URLSearchParams()), sourceId=DEFAULT_AUTOMATED_SOURCE_ID) {
  discoverySourceId(sourceId);
  if (!["new","dismissed","accepted","all"].includes(state)) throw new InvalidVisionInput("Choose a valid review filter.");
  const source = await db.query<DiscoveryState>(`select last_checked_at,last_success_at,last_error,last_outcome,record_count,coverage,coalesce(lease_until > clock_timestamp(),false) as running from vision_discovery_sources where id=$1`,[sourceId]);
  const candidates = await db.query<DiscoveryCandidate>(`select id,source_id,external_id,snapshot-'evidence' as snapshot,revision,review_state,opportunity_id,first_seen_at,last_seen_at,changed_at from vision_discovery_candidates where source_id=$7 and ($1='all' or review_state=$1)
    and ($2='' or snapshot->'details'->>'Record type'=$2)
    and ($3='' or strpos(lower(concat_ws(' ',snapshot->>'town',snapshot->>'county',snapshot->>'address')),lower($3))>0)
    and ($4='all' or ($4='known' and snapshot->>'sourceDate' is not null) or ($4='unknown' and snapshot->>'sourceDate' is null))
    and ($5='' or snapshot->>'sourceDate'>=$5) and ($6='' or snapshot->>'sourceDate'<=$6)
    order by snapshot->>'sourceDate' desc nulls last,changed_at desc,id limit 500`,[state,filters.applicationType,filters.location,filters.dateMode,filters.from,filters.to,sourceId]);
  const types=await db.query<{name:string}>(`select distinct snapshot->'details'->>'Record type' as name from vision_discovery_candidates where source_id=$1 and snapshot->'details'->>'Record type' is not null order by name`,[sourceId]);
  return { source:source.rows[0] ?? null, candidates:candidates.rows, applicationTypes:types.rows.map(row=>row.name) };
}
export async function discoveryDetail(db:Db,id:string) {
  const candidate = (await db.query<DiscoveryCandidate>("select * from vision_discovery_candidates where id=$1",[id])).rows[0];
  if (!candidate) return null;
  const history = await db.query<{revision:number;snapshot:DiscoveredRecord;captured_at:string}>("select revision,snapshot,captured_at from vision_discovery_history where candidate_id=$1 order by revision desc",[id]);
  return {candidate,history:history.rows};
}
class SourceValidationError extends Error { constructor(readonly fetched:number,readonly rejected:number){super("The source returned records outside its contract.");} }
function validateRecords(value:unknown,maxRecords:number): asserts value is DiscoveredRecord[] {
  if (!Array.isArray(value)) throw new SourceValidationError(0,1);
  if (value.length > maxRecords) throw new SourceValidationError(value.length,value.length-maxRecords);
  const records=value as DiscoveredRecord[],ids=new Set<string>();
  let rejected=0;
  for (const record of records) {
    try {
      parseVisionDraft({...record,town:record.town || "Unspecified",notes:""});
      if (typeof record.externalId !== "string" || !record.externalId.trim() || record.externalId.length>300 || ids.has(record.externalId)) throw new Error();
      if (typeof record.sourceDateLabel !== "string" || !record.sourceDateLabel.trim() || record.sourceDateLabel.length>100 || !record.details || typeof record.details!=="object" || Array.isArray(record.details) || Object.keys(record.details).length>40 || Object.entries(record.details).some(([k,v])=>k.length>100 || typeof v!=="string" || v.length>5000)) throw new Error();
      if (record.identityStatus !== undefined && !["resolved","unresolved"].includes(record.identityStatus)) throw new Error();
      if (record.classification !== undefined && !["opportunity","policy"].includes(record.classification)) throw new Error();
      if (record.evidence !== undefined) {
        if (!Array.isArray(record.evidence) || record.evidence.length > 240) throw new Error();
        for (const page of record.evidence) {
          if (!page || (page.kind !== undefined && page.kind !== "index-link") || typeof page.title !== "string" || page.title.length>500 || typeof page.text !== "string" || page.text.length>40000 || !Number.isSafeInteger(page.page) || page.page<1 || typeof page.checksum!=="string" || !/^[a-f0-9]{64}$/.test(page.checksum)) throw new Error();
          safeSourceUrl(page.url);
        }
      }
    } catch { rejected++; }
    if(typeof record.externalId==="string")ids.add(record.externalId);
  }
  if(rejected)throw new SourceValidationError(records.length,rejected);
}
function coverageDates(records:DiscoveredRecord[]) {
  const dates=records.map(record=>record.sourceDate).filter((date):date is string=>typeof date==="string" && /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  return {start:dates[0]??null,end:dates.at(-1)??null};
}
function elapsed(started:number){return Math.max(0,Math.min(2_147_483_647,Date.now()-started));}
const FAILED_SUMMARY="The source check failed. Coverage is incomplete. Saved records remain available. Try again later.";
async function recordRun(db:Db,input:{sourceId:string;startedAt:string;durationMs:number;outcome:DiscoveryRunOutcome;coverage:unknown;coverageStart:string|null;coverageEnd:string|null;fetched:number;inserted:number;updated:number;unchanged:number;rejected:number;error:string|null}) {
  await db.query(`insert into vision_discovery_sources(id) values($1) on conflict(id) do nothing`,[input.sourceId]);
  await db.query(`insert into vision_discovery_runs(source_id,started_at,duration_ms,outcome,coverage,coverage_start_date,coverage_end_date,fetched_count,inserted_count,updated_count,unchanged_count,rejected_count,error_summary)
    values($1,$2::timestamptz,$3,$4,$5::jsonb,$6::date,$7::date,$8,$9,$10,$11,$12,$13)`,[input.sourceId,input.startedAt,input.durationMs,input.outcome,JSON.stringify(input.coverage),input.coverageStart,input.coverageEnd,input.fetched,input.inserted,input.updated,input.unchanged,input.rejected,input.error]);
}
async function collectDiscoveryAttempt(db:Db,sourceId:string):Promise<DiscoveryRunResult> {
  const source=automatedSourceDefinition(sourceId),started=Date.now(),startedAt=new Date(started).toISOString();
  if(!source.enabled){
    await db.query(`insert into vision_discovery_sources(id,last_checked_at,last_outcome) values($1,clock_timestamp(),'skipped') on conflict(id) do update set last_checked_at=clock_timestamp(),last_outcome='skipped'`,[sourceId]);
    await recordRun(db,{sourceId,startedAt,durationMs:elapsed(started),outcome:"skipped",coverage:null,coverageStart:null,coverageEnd:null,fetched:0,inserted:0,updated:0,unchanged:0,rejected:0,error:null});
    return {sourceId,outcome:"skipped",count:0,coverage:null,fetched:0,inserted:0,updated:0,unchanged:0,rejected:0,error:null};
  }
  const token=randomUUID();
  const lease=await db.query(`insert into vision_discovery_sources(id,lease_token,lease_until,last_checked_at) values($1,$2,clock_timestamp()+interval '5 minutes',clock_timestamp())
    on conflict(id) do update set lease_token=$2,lease_until=clock_timestamp()+interval '5 minutes',last_checked_at=clock_timestamp()
    where (vision_discovery_sources.lease_until is null or vision_discovery_sources.lease_until <= clock_timestamp()) and (vision_discovery_sources.last_checked_at is null or vision_discovery_sources.last_checked_at <= clock_timestamp()-interval '5 minutes') returning id`,[sourceId,token]);
  if(!lease.rows.length){
    await db.query(`update vision_discovery_sources set last_outcome='blocked' where id=$1`,[sourceId]);
    await recordRun(db,{sourceId,startedAt,durationMs:elapsed(started),outcome:"blocked",coverage:null,coverageStart:null,coverageEnd:null,fetched:0,inserted:0,updated:0,unchanged:0,rejected:0,error:null});
    return {sourceId,outcome:"blocked",count:0,coverage:null,fetched:0,inserted:0,updated:0,unchanged:0,rejected:0,error:"A check is running or ran within the last five minutes. Wait five minutes between source checks."};
  }
  let fetched=0,rejected=0;
  try {
    const collected=await collectAutomatedSource(sourceId);fetched=Array.isArray(collected.records)?collected.records.length:0;validateRecords(collected.records,source.limits.maxRecords);
    const records=collected.records,coverage=collected.coverage,{start:coverageStart,end:coverageEnd}=coverageDates(records),outcome:DiscoveryRunOutcome=records.length?"completed":"completed_empty";
    const result=await db.query<{inserted_count:number;updated_count:number;unchanged_count:number}>(`with owned as (
      update vision_discovery_sources set last_success_at=clock_timestamp(),last_error=null,last_outcome=$9,record_count=$3,coverage=$5::jsonb,lease_token=null,lease_until=null
      where id=$1 and lease_token=$2 and lease_until>clock_timestamp() returning id
    ), incoming as (
      select item->>'externalId' as external_id,item as snapshot from jsonb_array_elements($4::jsonb) item
    ), classified as (
      select incoming.*,case when current.id is null then 'inserted' when current.snapshot is distinct from incoming.snapshot then 'updated' else 'unchanged' end as change
      from incoming cross join owned left join vision_discovery_candidates current on current.source_id=$1 and current.external_id=incoming.external_id
    ), imported as (
      insert into vision_discovery_candidates(source_id,external_id,snapshot)
      select owned.id,classified.external_id,classified.snapshot from owned cross join classified
      on conflict(source_id,external_id) do update set snapshot=excluded.snapshot,last_seen_at=clock_timestamp(),revision=vision_discovery_candidates.revision + case when vision_discovery_candidates.snapshot is distinct from excluded.snapshot then 1 else 0 end,changed_at=case when vision_discovery_candidates.snapshot is distinct from excluded.snapshot then clock_timestamp() else vision_discovery_candidates.changed_at end
      returning id,revision,snapshot
    ), history as (
      insert into vision_discovery_history(candidate_id,revision,snapshot) select id,revision,snapshot from imported on conflict do nothing
    ), counts as (
      select count(*) filter(where change='inserted')::integer as inserted_count,count(*) filter(where change='updated')::integer as updated_count,count(*) filter(where change='unchanged')::integer as unchanged_count from classified
    ), run as (
      insert into vision_discovery_runs(source_id,started_at,duration_ms,outcome,coverage,coverage_start_date,coverage_end_date,fetched_count,inserted_count,updated_count,unchanged_count,rejected_count)
      select owned.id,$6::timestamptz,greatest(0,floor(extract(epoch from (clock_timestamp()-$6::timestamptz))*1000))::integer,$9,$5::jsonb,$7::date,$8::date,$3,counts.inserted_count,counts.updated_count,counts.unchanged_count,0 from owned cross join counts
    ) select counts.* from owned cross join counts`,[sourceId,token,records.length,JSON.stringify(records),JSON.stringify(coverage),startedAt,coverageStart,coverageEnd,outcome]);
    if(!result.rows.length)throw new DiscoveryConflict("The source check expired. Start a new check.");
    const counts=result.rows[0];
    return {sourceId,outcome,count:records.length,coverage,fetched,inserted:counts.inserted_count,updated:counts.updated_count,unchanged:counts.unchanged_count,rejected:0,error:null};
  } catch(error) {
    if(error instanceof DiscoveryConflict){
      await recordRun(db,{sourceId,startedAt,durationMs:elapsed(started),outcome:"blocked",coverage:null,coverageStart:null,coverageEnd:null,fetched,inserted:0,updated:0,unchanged:0,rejected:0,error:null});
      return {sourceId,outcome:"blocked",count:0,coverage:null,fetched,inserted:0,updated:0,unchanged:0,rejected:0,error:error.message};
    }
    if(error instanceof SourceValidationError){fetched=error.fetched;rejected=error.rejected;}
    console.error("Vision source collection failed.",{sourceId,message:FAILED_SUMMARY});
    await db.query(`update vision_discovery_sources set last_error=$3,last_outcome='failed',lease_token=null,lease_until=null where id=$1 and lease_token=$2`,[sourceId,token,FAILED_SUMMARY]);
    await recordRun(db,{sourceId,startedAt,durationMs:elapsed(started),outcome:"failed",coverage:null,coverageStart:null,coverageEnd:null,fetched,inserted:0,updated:0,unchanged:0,rejected,error:FAILED_SUMMARY});
    return {sourceId,outcome:"failed",count:0,coverage:null,fetched,inserted:0,updated:0,unchanged:0,rejected,error:FAILED_SUMMARY};
  }
}
export async function collectDiscovery(db:Db,sourceId=DEFAULT_AUTOMATED_SOURCE_ID) {
  discoverySourceId(sourceId);
  const result=await collectDiscoveryAttempt(db,sourceId);
  if(result.outcome==="blocked")throw new DiscoveryConflict(result.error!);
  if(result.outcome==="failed")throw new DiscoverySourceFailure(result.error!);
  return {count:result.count,coverage:result.coverage,outcome:result.outcome,counts:{fetched:result.fetched,inserted:result.inserted,updated:result.updated,unchanged:result.unchanged,rejected:result.rejected}};
}
export async function collectAllDiscovery(db:Db) {
  return {mode:"all",results:await Promise.all(enabledAutomatedSourceDefinitions().map(source=>collectDiscoveryAttempt(db,source.id)))};
}
export async function discoverySourceHealth(db:Db) {
  const result=await db.query<DiscoveryState & {id:string}>(`select id,last_checked_at,last_success_at,last_error,last_outcome,record_count,coverage,coalesce(lease_until > clock_timestamp(),false) as running from vision_discovery_sources`);
  return Object.fromEntries(result.rows.map(row=>[row.id,row]));
}
export function parseDiscoveryReview(body:unknown) {
  if (!body || typeof body!=="object" || Array.isArray(body)) throw new InvalidVisionInput("Send a review object.");
  const b=body as Record<string,unknown>;
  if (typeof b.action!=="string" || !["accept","dismiss"].includes(b.action) || !Number.isSafeInteger(b.expectedRevision) || Number(b.expectedRevision)<1) throw new InvalidVisionInput("Send a review action and the current revision.");
  if (b.action==="accept" && (typeof b.notes!=="string" || b.notes.trim().length>8000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(b.notes))) throw new InvalidVisionInput("Send your review notes with at most 8000 characters.");
  if (b.opportunityId !== undefined && (b.action!=="accept" || typeof b.opportunityId!=="string" || !isUuid(b.opportunityId))) throw new InvalidVisionInput("Choose a valid existing opportunity.");
  if (b.action==="accept" && !b.opportunityId && (typeof b.town!=="string" || !b.town.trim() || b.town.trim().length>120)) throw new InvalidVisionInput("Enter the town before saving this opportunity.");
  return {opportunityId:typeof b.opportunityId==="string" ? b.opportunityId : null,town:typeof b.town==="string"?b.town.trim():"",action:b.action as "accept"|"dismiss",expectedRevision:Number(b.expectedRevision),notes:typeof b.notes==="string"?b.notes.trim():""};
}
export async function reviewDiscovery(db:Db,id:string,review:ReturnType<typeof parseDiscoveryReview>) {
  if (review.opportunityId && !(await db.query("select id from vision_opportunities where id=$1",[review.opportunityId])).rows.length) throw new InvalidVisionInput("This opportunity no longer exists. Choose another record.");
  if (review.action === "accept" && !review.opportunityId) {
    const record=(await discoveryDetail(db,id))?.candidate;
    if (record?.snapshot.identityStatus === "unresolved" || record?.snapshot.classification === "policy") throw new InvalidVisionInput("This source needs context. Link it to an existing opportunity or leave it in review.");
  }
  const result=await db.query<{id:string;opportunity_id:string|null}>(`with reviewed as (
    update vision_discovery_candidates set review_state=$3,opportunity_id=case when $3='accepted' then coalesce($6::uuid,gen_random_uuid()) else null end
    where id=$1 and revision=$2 and review_state='new' returning *
  ), saved as (
    insert into vision_opportunities(id,name,town,county,address,latitude,longitude,source_title,source_url,source_date,notes)
    select opportunity_id,snapshot->>'name',$5,snapshot->>'county',snapshot->>'address',
      (snapshot->>'latitude')::double precision,(snapshot->>'longitude')::double precision,snapshot->>'sourceTitle',snapshot->>'sourceUrl',null,
      concat_ws(E'\n\n',nullif($4,''),'Source record: ' || external_id,
        case when snapshot->>'sourceDate' is not null then (snapshot->>'sourceDateLabel') || ': ' || (snapshot->>'sourceDate') else 'The source did not provide a record date.' end)
    from reviewed where review_state='accepted' and $6::uuid is null returning id
  ) select id,opportunity_id from reviewed`,[id,review.expectedRevision,review.action==="accept"?"accepted":"dismissed",review.notes,review.town,review.opportunityId]);
  if (result.rows[0]) return result.rows[0];
  const existing=(await db.query<DiscoveryCandidate>("select * from vision_discovery_candidates where id=$1",[id])).rows[0];
  if (!existing) return null;
  if ((review.action==="accept" && existing.review_state==="accepted" && (!review.opportunityId || existing.opportunity_id===review.opportunityId)) || (review.action==="dismiss" && existing.review_state==="dismissed")) return {id:existing.id,opportunity_id:existing.opportunity_id};
  throw new DiscoveryConflict("This source record changed or was reviewed. Reload it before saving your review.");
}

/** Source evidence stays linked through candidate refreshes and keeps its capture history. */
export async function opportunityEvidence(db:Db, id:string) {
  return (await db.query<DiscoveryCandidate>("select * from vision_discovery_candidates where opportunity_id=$1 order by first_seen_at,id",[id])).rows;
}
