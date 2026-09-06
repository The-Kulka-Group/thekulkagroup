import { randomUUID } from "node:crypto";
import type { Db } from "@/lib/db";
import { DISCOVERY_SOURCE, fetchDiscoveryRecords, type DiscoveredRecord } from "./discovery-source";
import { isUuid } from "@/lib/uuid";
import { parseVisionDraft, safeSourceUrl, InvalidVisionInput } from "./input";
import { parseDiscoveryFilters, type DiscoveryFilters } from "./discovery-filters";

export type DiscoveryCandidate = { id:string; source_id:string; snapshot:DiscoveredRecord; revision:number; review_state:"new"|"dismissed"|"accepted"; opportunity_id:string|null; first_seen_at:string; last_seen_at:string; changed_at:string };
export type DiscoveryState = { last_checked_at:string|null; last_success_at:string|null; last_error:string|null; record_count:number; coverage:{year:number;documents:string[]}|null; running:boolean };
export class DiscoveryConflict extends Error {}
export const DISCOVERY_SOURCE_IDS = ["nassau-applications", "suffolk-planning"] as const;
export function discoverySourceId(value: unknown = DISCOVERY_SOURCE.id): string {
  if (typeof value !== "string" || !(DISCOVERY_SOURCE_IDS as readonly string[]).includes(value)) throw new InvalidVisionInput("Choose a supported source.");
  return value;
}
export async function discoveryInbox(db:Db, state="new", filters:DiscoveryFilters=parseDiscoveryFilters(new URLSearchParams()), sourceId=DISCOVERY_SOURCE.id) {
  discoverySourceId(sourceId);
  if (!["new","dismissed","accepted","all"].includes(state)) throw new InvalidVisionInput("Choose a valid review filter.");
  const source = await db.query<DiscoveryState>(`select last_checked_at,last_success_at,last_error,record_count,coverage,coalesce(lease_until > clock_timestamp(),false) as running from vision_discovery_sources where id=$1`,[sourceId]);
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
function validateRecords(records:DiscoveredRecord[]) {
  if (!Array.isArray(records) || records.length === 0 || records.length > 2000) throw new Error("The source returned an invalid record count.");
  const ids = new Set<string>();
  for (const record of records) {
    try { parseVisionDraft({...record,town:record.town || "Unspecified",notes:""}); }
    catch { throw new Error("The source returned invalid opportunity fields."); }
    if (typeof record.externalId !== "string" || !record.externalId.trim() || record.externalId.length>300 || ids.has(record.externalId)) throw new Error("The source returned an invalid or repeated record identifier.");
    if (typeof record.sourceDateLabel !== "string" || !record.sourceDateLabel.trim() || record.sourceDateLabel.length>100 || !record.details || typeof record.details!=="object" || Array.isArray(record.details) || Object.keys(record.details).length>40 || Object.entries(record.details).some(([k,v])=>k.length>100 || typeof v!=="string" || v.length>5000)) throw new Error("The source returned invalid record details.");
    if (record.identityStatus !== undefined && !["resolved","unresolved"].includes(record.identityStatus)) throw new Error("The source returned an invalid identity status.");
    if (record.classification !== undefined && !["opportunity","policy"].includes(record.classification)) throw new Error("The source returned an invalid classification.");
    if (record.evidence !== undefined) {
      if (!Array.isArray(record.evidence) || record.evidence.length > 240) throw new Error("The source returned too many evidence pages.");
      for (const page of record.evidence) {
        if (!page || typeof page.title !== "string" || page.title.length>500 || typeof page.text !== "string" || page.text.length>10000 || !Number.isSafeInteger(page.page) || page.page<1 || typeof page.checksum!=="string" || !/^[a-f0-9]{64}$/.test(page.checksum)) throw new Error("The source returned invalid evidence.");
        try { safeSourceUrl(page.url); } catch { throw new Error("The source returned an invalid evidence link."); }
      }
    }
    ids.add(record.externalId);
  }
}
export async function collectDiscovery(db:Db, sourceId=DISCOVERY_SOURCE.id) {
  discoverySourceId(sourceId);
  const token=randomUUID();
  const lease=await db.query(`insert into vision_discovery_sources(id,lease_token,lease_until,last_checked_at) values($1,$2,clock_timestamp()+interval '5 minutes',clock_timestamp())
    on conflict(id) do update set lease_token=$2,lease_until=clock_timestamp()+interval '5 minutes',last_checked_at=clock_timestamp()
    where (vision_discovery_sources.lease_until is null or vision_discovery_sources.lease_until <= clock_timestamp()) and (vision_discovery_sources.last_checked_at is null or vision_discovery_sources.last_checked_at <= clock_timestamp()-interval '5 minutes') returning id`,[sourceId,token]);
  if (!lease.rows.length) throw new DiscoveryConflict("A check is running or ran within the last five minutes. Wait five minutes between source checks.");
  try {
    const records=sourceId === "suffolk-planning" ? await (await import("./suffolk-source")).fetchSuffolkRecords() : await fetchDiscoveryRecords(); validateRecords(records);
    const coverage=sourceId === "suffolk-planning" ? {year:new Date().getUTCFullYear(),documents:[...new Set(records.flatMap(record=>record.evidence?.map(page=>page.url) ?? []))].sort()} : null;
    const result=await db.query(`with owned as (
      update vision_discovery_sources set last_success_at=clock_timestamp(),last_error=null,record_count=$3,coverage=$5::jsonb,lease_token=null,lease_until=null
      where id=$1 and lease_token=$2 and lease_until>clock_timestamp() returning id
    ), imported as (
      insert into vision_discovery_candidates(source_id,external_id,snapshot)
      select owned.id,item->>'externalId',item from owned cross join jsonb_array_elements($4::jsonb) item
      on conflict(source_id,external_id) do update set
        snapshot=excluded.snapshot,last_seen_at=clock_timestamp(),
        revision=vision_discovery_candidates.revision + case when vision_discovery_candidates.snapshot is distinct from excluded.snapshot then 1 else 0 end,
        changed_at=case when vision_discovery_candidates.snapshot is distinct from excluded.snapshot then clock_timestamp() else vision_discovery_candidates.changed_at end
      returning id,revision,snapshot
    ), history as (
      insert into vision_discovery_history(candidate_id,revision,snapshot) select id,revision,snapshot from imported on conflict do nothing
    ) select id from owned`,[sourceId,token,records.length,JSON.stringify(records),JSON.stringify(coverage)]);
    if (!result.rows.length) throw new DiscoveryConflict("The source check expired. Start a new check.");
    return {count:records.length,coverage};
  } catch(error) {
    await db.query(`update vision_discovery_sources set last_error=$3,lease_token=null,lease_until=null where id=$1 and lease_token=$2`,[sourceId,token,"The source check failed. Coverage is incomplete. Saved records remain available. Try again later."]);
    throw error;
  }
}
export function parseDiscoveryReview(body:unknown) {
  if (!body || typeof body!=="object" || Array.isArray(body)) throw new InvalidVisionInput("Send a review object.");
  const b=body as Record<string,unknown>;
  if (typeof b.action!=="string" || !["accept","dismiss"].includes(b.action) || !Number.isSafeInteger(b.expectedRevision) || Number(b.expectedRevision)<1) throw new InvalidVisionInput("Send a review action and the current revision.");
  if (b.action==="accept" && (typeof b.notes!=="string" || b.notes.trim().length>8000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(b.notes))) throw new InvalidVisionInput("Send your review notes with at most 8000 characters.");
  if (b.opportunityId !== undefined && (b.action!=="accept" || !isUuid(b.opportunityId))) throw new InvalidVisionInput("Choose a valid existing opportunity.");
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
