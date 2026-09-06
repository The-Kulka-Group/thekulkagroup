import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi } from "vitest";
import { seededDatabase } from "@/test/database";
import type { Db } from "@/lib/db";
let db:Awaited<ReturnType<typeof seededDatabase>>;
const fetchRecords=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/db",()=>({getDb:()=>db as Db}));
vi.mock("@/lib/vision/discovery-source",()=>({DISCOVERY_SOURCE:{id:"nassau-applications"},fetchDiscoveryRecords:fetchRecords}));
const inbox=await import("./route");const refresh=await import("./refresh/route");const detail=await import("./[id]/route");const cron=await import("./cron/route");
const source={externalId:"zoning/test-1",name:"Synthetic development record",town:"Test town",county:"Nassau",address:"Test address",latitude:null,longitude:null,sourceTitle:"Synthetic planning record",sourceUrl:"https://example.org/test",sourceDate:"2026-08-01",sourceDateLabel:"Referral date",details:{Type:"Synthetic zoning"}};
const req=(body?:unknown,auth?:string)=>new Request("http://localhost/api/vision/discovery",{method:body===undefined?"GET":"POST",body:body===undefined?undefined:JSON.stringify(body),headers:auth?{"x-kulka-test-auth":auth}:{}});
const ctx=(id:string)=>({params:Promise.resolve({id})});
const check=()=>refresh.POST(req({}));
const listed=async()=> (await (await inbox.GET(req())).json()).candidates;
const age=()=>db.query("update vision_discovery_sources set last_checked_at=clock_timestamp()-interval '6 minutes'");
const review=(id:string,action="accept",revision=1)=>detail.POST(req({action,expectedRevision:revision,notes:"Reviewed by a person.",town:"Test town"}),ctx(id));
beforeAll(async()=>{db=await seededDatabase();},60000);
beforeEach(async()=>{vi.stubEnv("KULKA_AUTH_BYPASS","");await db.query("truncate vision_discovery_history,vision_discovery_candidates,vision_discovery_sources,vision_opportunities restart identity cascade");fetchRecords.mockReset();fetchRecords.mockResolvedValue([source]);});
afterEach(()=>vi.unstubAllEnvs());afterAll(async()=>db?.close());
describe("Vision discovery API",()=>{
 it("keeps repeated records, records changed snapshots, and preserves saved opportunity notes",async()=>{
  expect((await check()).status).toBe(200);const [item]=await listed();
  await age();await check();let record=await (await detail.GET(req(),ctx(item.id))).json();expect(record.history).toHaveLength(1);
  const accepted=await (await review(item.id)).json();
  await db.query("update vision_opportunities set notes='Human notes after saving' where id=$1",[accepted.opportunity_id]);
  await age();fetchRecords.mockResolvedValue([{...source,name:"Changed source title",sourceDate:null}]);await check();
  record=await (await detail.GET(req(),ctx(item.id))).json();expect(record.candidate).toMatchObject({review_state:"accepted",revision:2});expect(record.history).toHaveLength(2);
  expect((await db.query<{notes:string;source_date:null}>("select notes,source_date from vision_opportunities")).rows[0]).toEqual({notes:"Human notes after saving",source_date:null});
  expect((await review(item.id)).status).toBe(200);
 });
 it("accepts once under concurrent retries and labels the original source date",async()=>{
  await check();const [item]=await listed();const results=await Promise.all([review(item.id),review(item.id)]);
  expect(results.map(x=>x.status)).toEqual([200,200]);const bodies=await Promise.all(results.map(x=>x.json()));expect(bodies[0].opportunity_id).toBe(bodies[1].opportunity_id);
  const rows=(await db.query<{notes:string;source_date:null}>("select notes,source_date from vision_opportunities")).rows;expect(rows).toHaveLength(1);expect(rows[0].notes).toContain("Referral date: 2026-08-01");expect(rows[0].source_date).toBe(null);
 });
 it("keeps dismissed state after refresh and rejects stale reviews",async()=>{
  await check();const [item]=await listed();await age();fetchRecords.mockResolvedValue([{...source,address:"Changed address"}]);await check();
  expect((await review(item.id,"dismiss")).status).toBe(409);expect((await review(item.id,"dismiss",2)).status).toBe(200);await age();await check();
  expect(await listed()).toEqual([]);expect((await review(item.id,"dismiss",2)).status).toBe(200);expect((await review(item.id,"accept",2)).status).toBe(409);
 });
 it("requires reviewer town when the source town is missing",async()=>{
  fetchRecords.mockResolvedValue([{...source,town:""}]);await check();const [item]=await listed();
  expect((await detail.POST(req({action:"accept",expectedRevision:1,notes:"",town:""}),ctx(item.id))).status).toBe(400);
  expect((await review(item.id)).status).toBe(200);
 });
 it("keeps saved records and last success when fetches fail or return malformed records",async()=>{
  await check();const before=await (await inbox.GET(req())).json();
  for(const bad of [null,[],[{...source,externalId:""}],[{...source,sourceUrl:"javascript:alert(1)"}],[source,source],[{...source,details:{x:4}}]]){
   await age();fetchRecords.mockResolvedValue(bad);expect((await check()).status).toBe(502);const after=await (await inbox.GET(req())).json();expect(after.candidates).toEqual(before.candidates);expect(after.source.last_success_at).toBe(before.source.last_success_at);expect(after.source.last_error).toContain("failed");
  }
  await age();fetchRecords.mockRejectedValue(new Error("Private upstream error"));expect((await check()).status).toBe(502);
 });
 it("rejects an empty result without deleting previous candidates",async()=>{await check();await age();fetchRecords.mockResolvedValue([]);expect((await check()).status).toBe(502);const result=await (await inbox.GET(req())).json();expect(result.candidates).toHaveLength(1);expect(result.source.record_count).toBe(1);});
 it("shares an expiring lease, rate limits checks and protects against an old run overwriting a newer lease",async()=>{
  let release!:(records:typeof source[])=>void;fetchRecords.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const first=check();
  for(let attempt=0;attempt<100 && !release;attempt++)await new Promise(resolve=>setTimeout(resolve,1));
  expect((await check()).status).toBe(409);expect(fetchRecords).toHaveBeenCalledTimes(1);
  await db.query("update vision_discovery_sources set lease_until=clock_timestamp()-interval '1 second',last_checked_at=clock_timestamp()-interval '6 minutes'");
  fetchRecords.mockResolvedValue([{...source,name:"New run"}]);expect((await check()).status).toBe(200);release([source]);expect((await first).status).toBe(409);expect((await listed())[0].snapshot.name).toBe("New run");expect((await check()).status).toBe(409);
 });
 it("rejects invalid identifiers, missing records, bodies and revisions",async()=>{
  for(const id of ["bad","00000000-0000-4000-8000-000000000099"]){expect((await detail.GET(req(),ctx(id))).status).toBe(404);expect((await review(id)).status).toBe(404);}
  await check();const [item]=await listed();for(const body of [[],{action:["accept"],expectedRevision:1},{action:"erase",expectedRevision:1},{action:"accept",notes:"",town:"X"},{action:"accept",expectedRevision:1,town:"X"}]) expect((await detail.POST(req(body),ctx(item.id))).status).toBe(400);
  expect((await detail.POST(new Request("http://localhost",{method:"POST",body:"{"}),ctx(item.id))).status).toBe(400);
  expect((await inbox.GET(new Request("http://localhost?state=bad"))).status).toBe(400);
 });
 it("rejects unauthorized users and temporary writes",async()=>{
  for(const [auth,status] of [["signed-out",401],["forbidden",403]] as const){expect((await inbox.GET(req(undefined,auth))).status).toBe(status);expect((await refresh.POST(req({},auth))).status).toBe(status);expect((await detail.POST(req({},auth),ctx("bad"))).status).toBe(status);expect((await detail.GET(req(undefined,auth),ctx("bad"))).status).toBe(status);}
  vi.stubEnv("KULKA_AUTH_BYPASS","1");expect((await inbox.GET(req())).status).toBe(200);expect((await refresh.POST(req({}))).status).toBe(403);expect((await detail.POST(req({}),ctx("bad"))).status).toBe(403);expect(fetchRecords).not.toHaveBeenCalled();
 });
 it("requires a long matching cron secret independent of user access",async()=>{
  vi.stubEnv("KULKA_AUTH_BYPASS","1");const call=(token:string)=>cron.POST(new Request("http://localhost",{method:"POST",headers:{authorization:`Bearer ${token}`}}));
  vi.stubEnv("VISION_DISCOVERY_CRON_SECRET","");expect((await call("")).status).toBe(401);vi.stubEnv("VISION_DISCOVERY_CRON_SECRET","short");expect((await call("short")).status).toBe(401);
  vi.stubEnv("VISION_DISCOVERY_CRON_SECRET","a".repeat(32));expect((await call("b".repeat(32))).status).toBe(401);expect((await call("é".repeat(32))).status).toBe(401);expect((await call("a".repeat(32))).status).toBe(200);
 });
 it("enables RLS without browser policies on each discovery table",async()=>{
  for(const table of ["vision_discovery_sources","vision_discovery_candidates","vision_discovery_history"]){expect((await db.query<{relrowsecurity:boolean}>("select relrowsecurity from pg_class where relname=$1",[table])).rows[0].relrowsecurity).toBe(true);expect((await db.query("select * from pg_policies where tablename=$1",[table])).rows).toEqual([]);}
 });
});
