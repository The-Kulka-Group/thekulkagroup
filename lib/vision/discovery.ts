import { randomUUID } from "node:crypto";
import type { Db } from "@/lib/db";
import { DISCOVERY_SOURCE, fetchDiscoveryRecords, type DiscoveredRecord } from "./discovery-source";
import { parseVisionDraft, InvalidVisionInput } from "./input";

export type DiscoveryCandidate = { id:string; snapshot:DiscoveredRecord; revision:number; review_state:"new"|"dismissed"|"accepted"; opportunity_id:string|null; first_seen_at:string; last_seen_at:string; changed_at:string };
export type DiscoveryState = { last_checked_at:string|null; last_success_at:string|null; last_error:string|null; record_count:number; running:boolean };
export class DiscoveryConflict extends Error {}
export async function discoveryInbox(db:Db, state="new") {
  if (!["new","dismissed","accepted","all"].includes(state)) throw new InvalidVisionInput("Choose a valid review filter.");
  const source = await db.query<DiscoveryState>(`select last_checked_at,last_success_at,last_error,record_count,coalesce(lease_until > clock_timestamp(),false) as running from vision_discovery_sources where id=$1`,[DISCOVERY_SOURCE.id]);
  const candidates = await db.query<DiscoveryCandidate>(`select * from vision_discovery_candidates where ($1='all' or review_state=$1) order by snapshot->>'sourceDate' desc nulls last,changed_at desc,id limit 500`,[state]);
  return { source:source.rows[0] ?? null, candidates:candidates.rows };
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
    parseVisionDraft({...record,town:record.town || "Unspecified",notes:""});
    if (typeof record.externalId !== "string" || !record.externalId.trim() || record.externalId.length>300 || ids.has(record.externalId)) throw new Error("The source returned an invalid or repeated record identifier.");
    if (typeof record.sourceDateLabel !== "string" || !record.sourceDateLabel.trim() || record.sourceDateLabel.length>100 || !record.details || typeof record.details!=="object" || Array.isArray(record.details) || Object.keys(record.details).length>40 || Object.entries(record.details).some(([k,v])=>k.length>100 || typeof v!=="string" || v.length>5000)) throw new Error("The source returned invalid record details.");
    ids.add(record.externalId);
  }
}
export async function collectDiscovery(db:Db) {
  const token=randomUUID();
  const lease=await db.query(`insert into vision_discovery_sources(id,lease_token,lease_until,last_checked_at) values($1,$2,clock_timestamp()+interval '5 minutes',clock_timestamp())
    on conflict(id) do update set lease_token=$2,lease_until=clock_timestamp()+interval '5 minutes',last_checked_at=clock_timestamp()
    where (vision_discovery_sources.lease_until is null or vision_discovery_sources.lease_until <= clock_timestamp()) and (vision_discovery_sources.last_checked_at is null or vision_discovery_sources.last_checked_at <= clock_timestamp()-interval '5 minutes') returning id`,[DISCOVERY_SOURCE.id,token]);
  if (!lease.rows.length) throw new DiscoveryConflict("A check is running or ran within the last five minutes. Wait five minutes between source checks.");
  try {
    const records=await fetchDiscoveryRecords(); validateRecords(records);
    const result=await db.query(`with owned as (
      update vision_discovery_sources set last_success_at=clock_timestamp(),last_error=null,record_count=$3,lease_token=null,lease_until=null
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
    ) select id from owned`,[DISCOVERY_SOURCE.id,token,records.length,JSON.stringify(records)]);
    if (!result.rows.length) throw new DiscoveryConflict("The source check expired. Start a new check.");
    return {count:records.length};
  } catch(error) {
    await db.query(`update vision_discovery_sources set last_error=$3,lease_token=null,lease_until=null where id=$1 and lease_token=$2`,[DISCOVERY_SOURCE.id,token,"The source check failed. Saved records remain available. Try again later."]);
    throw error;
  }
}
export function parseDiscoveryReview(body:unknown) {
  if (!body || typeof body!=="object" || Array.isArray(body)) throw new InvalidVisionInput("Send a review object.");
  const b=body as Record<string,unknown>;
  if (typeof b.action!=="string" || !["accept","dismiss"].includes(b.action) || !Number.isSafeInteger(b.expectedRevision) || Number(b.expectedRevision)<1) throw new InvalidVisionInput("Send a review action and the current revision.");
  if (b.action==="accept" && (typeof b.notes!=="string" || b.notes.trim().length>8000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(b.notes))) throw new InvalidVisionInput("Send your review notes with at most 8000 characters.");
  if (b.action==="accept" && (typeof b.town!=="string" || !b.town.trim() || b.town.trim().length>120)) throw new InvalidVisionInput("Enter the town before saving this opportunity.");
  return {town:typeof b.town==="string"?b.town.trim():"",action:b.action as "accept"|"dismiss",expectedRevision:Number(b.expectedRevision),notes:typeof b.notes==="string"?b.notes.trim():""};
}
export async function reviewDiscovery(db:Db,id:string,review:ReturnType<typeof parseDiscoveryReview>) {
  const result=await db.query<{id:string;opportunity_id:string|null}>(`with reviewed as (
    update vision_discovery_candidates set review_state=$3,opportunity_id=case when $3='accepted' then gen_random_uuid() else null end
    where id=$1 and revision=$2 and review_state='new' returning *
  ), saved as (
    insert into vision_opportunities(id,name,town,county,address,latitude,longitude,source_title,source_url,source_date,notes)
    select opportunity_id,snapshot->>'name',$5,snapshot->>'county',snapshot->>'address',
      (snapshot->>'latitude')::double precision,(snapshot->>'longitude')::double precision,snapshot->>'sourceTitle',snapshot->>'sourceUrl',null,
      concat_ws(E'\n\n',nullif($4,''),'Source record: ' || external_id,
        case when snapshot->>'sourceDate' is not null then (snapshot->>'sourceDateLabel') || ': ' || (snapshot->>'sourceDate') else 'The source did not provide a record date.' end)
    from reviewed where review_state='accepted' returning id
  ) select id,opportunity_id from reviewed`,[id,review.expectedRevision,review.action==="accept"?"accepted":"dismissed",review.notes,review.town]);
  if (result.rows[0]) return result.rows[0];
  const existing=(await db.query<DiscoveryCandidate>("select * from vision_discovery_candidates where id=$1",[id])).rows[0];
  if (!existing) return null;
  if ((review.action==="accept" && existing.review_state==="accepted") || (review.action==="dismiss" && existing.review_state==="dismissed")) return {id:existing.id,opportunity_id:existing.opportunity_id};
  throw new DiscoveryConflict("This source record changed or was reviewed. Reload it before saving your review.");
}
