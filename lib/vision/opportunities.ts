import type { Db } from "@/lib/db";
import type { VisionDraft, VisionFilters, VisionOpportunity, VisionReview } from "./types";

type Row = {
  id: string; opportunity_number: string | number; name: string; town: string; county: string; address: string;
  latitude: number | null; longitude: number | null; source_title: string; source_url: string;
  source_date: Date | string | null; notes: string; status: VisionOpportunity["status"]; revision: number;
  created_at: Date | string; updated_at: Date | string;
};
function record(row: Row): VisionOpportunity {
  return {
    id: row.id, sheetNumber: `V-${String(Number(row.opportunity_number) + 100).padStart(3, "0")}`,
    name: row.name, town: row.town, county: row.county, address: row.address,
    latitude: row.latitude, longitude: row.longitude, sourceTitle: row.source_title, sourceUrl: row.source_url,
    sourceDate: row.source_date ? (row.source_date instanceof Date ? row.source_date.toISOString() : row.source_date).slice(0, 10) : null,
    notes: row.notes, status: row.status, revision: row.revision,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  };
}
export async function createVisionOpportunity(db: Db, draft: VisionDraft): Promise<VisionOpportunity> {
  const { rows } = await db.query<Row>(`insert into vision_opportunities
    (name,town,county,address,latitude,longitude,source_title,source_url,source_date,notes)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
  [draft.name,draft.town,draft.county,draft.address,draft.latitude,draft.longitude,draft.sourceTitle,draft.sourceUrl,draft.sourceDate,draft.notes]);
  return record(rows[0]);
}
export async function listVisionOpportunities(db: Db, filters: VisionFilters = {}): Promise<VisionOpportunity[]> {
  const { rows } = await db.query<Row>(`select * from vision_opportunities
    where ($1 = '' or strpos(lower('V-' || (opportunity_number + 100)::text || ' ' || name || ' ' || town || ' ' || county || ' ' || address || ' ' || source_title || ' ' || notes), lower($1)) > 0)
    and ($2 = '' or lower(county) = lower($2)) and ($3 = '' or status = $3)
    order by updated_at desc, opportunity_number desc`, [filters.search ?? "",filters.county ?? "",filters.status ?? ""]);
  return rows.map(record);
}
export async function listVisionCounties(db: Db): Promise<string[]> {
  const { rows } = await db.query<{county:string}>("select distinct county from vision_opportunities order by county");
  return rows.map(row => row.county);
}
export async function getVisionOpportunity(db: Db, id: string): Promise<VisionOpportunity | null> {
  const { rows } = await db.query<Row>("select * from vision_opportunities where id = $1", [id]);
  return rows[0] ? record(rows[0]) : null;
}
export class VisionRevisionConflict extends Error {
  constructor() { super("This opportunity changed before your review was saved. Reload the record, review the latest notes, and try again."); }
}
export async function updateVisionReview(db: Db, id: string, review: VisionReview, draft?: VisionDraft): Promise<VisionOpportunity | null> {
  if (draft) {
    const { rows } = await db.query<Row>(`update vision_opportunities set name=$5,town=$6,county=$7,address=$8,latitude=$9,longitude=$10,
      source_title=$11,source_url=$12,source_date=$13,notes=$2,status=$3,revision=revision+1,updated_at=clock_timestamp()
      where id=$1 and revision=$4 returning *`, [id,review.notes,review.status,review.expectedRevision,draft.name,draft.town,draft.county,draft.address,draft.latitude,draft.longitude,draft.sourceTitle,draft.sourceUrl,draft.sourceDate]);
    if (rows[0]) return record(rows[0]);
    if (await getVisionOpportunity(db,id)) throw new VisionRevisionConflict();
    return null;
  }
  const { rows } = await db.query<Row>(`update vision_opportunities set notes=$2,status=$3,revision=revision+1,updated_at=clock_timestamp()
    where id=$1 and revision=$4 returning *`, [id,review.notes,review.status,review.expectedRevision]);
  if (rows[0]) return record(rows[0]);
  if (await getVisionOpportunity(db,id)) throw new VisionRevisionConflict();
  return null;
}

export async function updateVisionLocation(db: Db, id: string, location: {address:string;latitude:number|null;longitude:number|null;expectedRevision:number}): Promise<VisionOpportunity|null> {
  const { rows } = await db.query<Row>(`update vision_opportunities set address=$2,latitude=$3,longitude=$4,revision=revision+1,updated_at=clock_timestamp()
    where id=$1 and revision=$5 returning *`, [id,location.address,location.latitude,location.longitude,location.expectedRevision]);
  if (rows[0]) return record(rows[0]);
  if (await getVisionOpportunity(db,id)) throw new VisionRevisionConflict();
  return null;
}
