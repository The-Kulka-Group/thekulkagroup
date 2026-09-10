import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi } from "vitest";
import { seededDatabase } from "@/test/database";
import type { Db } from "@/lib/db";
let db:Awaited<ReturnType<typeof seededDatabase>>;
const fetchRecords=vi.hoisted(()=>vi.fn());
const fetchSuffolk=vi.hoisted(()=>vi.fn());
const fetchNassauIda=vi.hoisted(()=>vi.fn());
const fetchSuffolkIda=vi.hoisted(()=>vi.fn());
const fetchOysterBayZba=vi.hoisted(()=>vi.fn());
const fetchCivicPlus=vi.hoisted(()=>vi.fn());
const fetchSmartGov=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/vision/ida-source",()=>({fetchNassauIdaRecords:fetchNassauIda,fetchSuffolkIdaRecords:fetchSuffolkIda}));
vi.mock("@/lib/vision/suffolk-source",()=>({fetchSuffolkRecords:fetchSuffolk}));
vi.mock("@/lib/vision/oyster-bay-zba-source",()=>({fetchOysterBayZbaRecords:fetchOysterBayZba}));
vi.mock("@/lib/vision/civicplus-source",()=>({fetchCivicPlusRecords:fetchCivicPlus}));
vi.mock("@/lib/vision/smartgov-source",()=>({fetchSmartGovRecords:fetchSmartGov}));
vi.mock("@/lib/db",()=>({getDb:()=>db as Db}));
vi.mock("@/lib/vision/discovery-source",()=>({DISCOVERY_SOURCE:{id:"nassau-applications"},fetchDiscoveryRecords:fetchRecords}));
const inbox=await import("./route");const refresh=await import("./refresh/route");const detail=await import("./[id]/route");const cron=await import("./cron/route");
const {SourceCollectionFailure}=await import("@/lib/vision/source-registry");
const source={externalId:"zoning/test-1",name:"Synthetic development record",town:"Test town",county:"Nassau",address:"Test address",latitude:null,longitude:null,sourceTitle:"Synthetic planning record",sourceUrl:"https://example.org/test",sourceDate:"2026-08-01",sourceDateLabel:"Referral date",details:{Type:"Synthetic zoning"}};
const req=(body?:unknown,auth?:string)=>new Request("http://localhost/api/vision/discovery",{method:body===undefined?"GET":"POST",body:body===undefined?undefined:JSON.stringify(body),headers:auth?{"x-kulka-test-auth":auth}:{}});
const ctx=(id:string)=>({params:Promise.resolve({id})});
const check=()=>refresh.POST(req({}));
const listed=async()=> (await (await inbox.GET(req())).json()).candidates;
const age=()=>db.query("update vision_discovery_sources set last_checked_at=clock_timestamp()-interval '6 minutes'");
const review=(id:string,action="accept",revision=1)=>detail.POST(req({action,expectedRevision:revision,notes:"Reviewed by a person.",town:"Test town"}),ctx(id));
beforeAll(async()=>{db=await seededDatabase();},60000);
beforeEach(async()=>{vi.stubEnv("KULKA_AUTH_BYPASS","");await db.query("truncate vision_discovery_runs,vision_discovery_history,vision_discovery_candidates,vision_discovery_sources,vision_opportunities restart identity cascade");fetchRecords.mockReset();fetchRecords.mockResolvedValue([source]);fetchSuffolk.mockReset();fetchSuffolk.mockResolvedValue([{...source,county:"Suffolk"}]);fetchNassauIda.mockReset();fetchSuffolkIda.mockReset();fetchOysterBayZba.mockReset();fetchCivicPlus.mockReset();fetchSmartGov.mockReset();fetchNassauIda.mockResolvedValue([{...source,externalId:"ida-project"}]);fetchSuffolkIda.mockResolvedValue([{...source,externalId:"ida-document",county:"Suffolk"}]);fetchOysterBayZba.mockResolvedValue({records:[{...source,externalId:"oyster-bay-appeal"}],coverage:{year:2026,documents:[]}});fetchCivicPlus.mockResolvedValue({records:[{...source,externalId:"civicplus-case"}],coverage:{year:2026,documents:["https://example.org/agenda.pdf"]}});fetchSmartGov.mockResolvedValue([{...source,externalId:"permit:00000000-0000-4000-8000-000000000001",sourceCaseId:"PERMIT-1",sourceTitle:"Village of Hempstead SmartGov permit search",sourceUrl:"https://vlg-hempstead-ny.smartgovcommunity.com/PermittingPublic/PermitLandingPagePublic/Index/00000000-0000-4000-8000-000000000001"}]);});
afterEach(()=>vi.unstubAllEnvs());afterAll(async()=>db?.close());
describe("Vision discovery API",()=>{
 it("collects a CivicPlus source through the shared flow and keeps unresolved document revisions in review",async()=>{
  const sourceId="nassau-village-hempstead-records";
  const evidence={url:"https://www.villageofhempstead.org/AgendaCenter/ViewFile/Agenda/_07202026-1174",title:"Agenda: Planning Board Agenda",page:1,checksum:"a".repeat(64),text:"CASE 2026-29: 247 Greenwich Street"};
  const unresolved={...source,externalId:"document:3:2026-07-20:1174:agenda",sourceUrl:evidence.url,identityStatus:"unresolved" as const,evidence};
  fetchCivicPlus.mockResolvedValue({records:[{...unresolved,evidence:[evidence]}],coverage:{year:2026,documents:[evidence.url]}});
  const run=()=>refresh.POST(new Request(`http://localhost?source=${sourceId}`,{method:"POST"}));
  expect((await run()).status).toBe(200);
  const first=await (await inbox.GET(new Request(`http://localhost?source=${sourceId}`))).json();
  expect(first.candidates).toHaveLength(1);expect(first.source.coverage.documents).toEqual([evidence.url]);
  expect((await review(first.candidates[0].id)).status).toBe(400);
  await age();fetchCivicPlus.mockResolvedValue({records:[{...unresolved,evidence:[{...evidence,checksum:"b".repeat(64),text:"Revised agenda"}]}],coverage:{year:2026,documents:[evidence.url]}});
  expect((await run()).status).toBe(200);
  const changed=await (await detail.GET(req(),ctx(first.candidates[0].id))).json();
  expect(changed.candidate.revision).toBe(2);expect(changed.history).toHaveLength(2);expect(changed.candidate.review_state).toBe("new");
 });
 it("passes existing SmartGov snapshots to repeat checks and preserves review state",async()=>{
  const run=()=>refresh.POST(new Request("http://localhost?source=hempstead-village-smartgov",{method:"POST"}));
  expect((await run()).status).toBe(200);
  const response=await (await inbox.GET(new Request("http://localhost?sources=hempstead-village-smartgov"))).json();
  const item=response.candidates[0];
  expect((await review(item.id)).status).toBe(200);
  await age();
  fetchSmartGov.mockImplementation(async(_definition:unknown,existing:Map<string,typeof source>)=>{
   expect(existing.get(item.external_id)).toMatchObject({externalId:item.external_id,sourceCaseId:"PERMIT-1"});
   return [existing.get(item.external_id)!];
  });
  expect((await run()).status).toBe(200);
  const stable=await (await detail.GET(req(),ctx(item.id))).json();
  expect(stable.candidate).toMatchObject({review_state:"accepted",revision:1});
  expect(stable.history).toHaveLength(1);
 });
 it("collects both IDA sources independently and retains reviews, evidence and history on stable refresh",async()=>{
  const evidence={kind:"index-link",url:"https://suffolkida.org/wp-content/uploads/test.pdf",title:"Index link metadata",page:1,checksum:"a".repeat(64),text:"Synthetic index metadata. PDF contents were not read."};
  fetchSuffolkIda.mockResolvedValue([{...source,externalId:"ida-document",county:"Suffolk",evidence:[evidence]}]);
  const run=(id:string,auth?:string)=>refresh.POST(new Request(`http://localhost?source=${id}`,{method:"POST",headers:auth?{"x-kulka-test-auth":auth}:{}}));
  expect((await run("nassau-ida")).status).toBe(200);
  expect((await run("suffolk-ida")).status).toBe(200);
  expect(fetchRecords).not.toHaveBeenCalled();expect(fetchSuffolk).not.toHaveBeenCalled();
  const both=await (await inbox.GET(new Request("http://localhost?sources=nassau-ida,suffolk-ida"))).json();
  expect(both.candidates).toHaveLength(2);
  expect(new Set(both.candidates.map((row:{source_id:string})=>row.source_id))).toEqual(new Set(["nassau-ida","suffolk-ida"]));
  const candidate=both.candidates.find((row:{source_id:string})=>row.source_id==="suffolk-ida");
  const saved=await (await review(candidate.id)).json();
  await db.query("update vision_opportunities set notes='Keep reviewed notes' where id=$1",[saved.opportunity_id]);
  expect((await run("suffolk-ida")).status).toBe(409);
  await age();expect((await run("suffolk-ida")).status).toBe(200);
  const stable=await (await detail.GET(req(),ctx(candidate.id))).json();
  expect(stable.history).toHaveLength(1);expect(stable.candidate.review_state).toBe("accepted");expect(stable.candidate.snapshot.evidence).toEqual([evidence]);
  await age();fetchNassauIda.mockRejectedValue(new Error("Missing page"));
  expect((await run("nassau-ida")).status).toBe(502);
  expect((await run("suffolk-ida")).status).toBe(200);
  const after=await (await inbox.GET(new Request("http://localhost?sources=nassau-ida,suffolk-ida&state=all"))).json();
  expect(after.candidates).toHaveLength(2);expect(after.sources["nassau-ida"].last_error).toContain("incomplete");expect(after.sources["suffolk-ida"].last_error).toBeNull();
  expect((await db.query<{notes:string}>("select notes from vision_opportunities where id=$1",[saved.opportunity_id])).rows[0].notes).toBe("Keep reviewed notes");
  vi.stubEnv("KULKA_AUTH_BYPASS","1");expect((await run("nassau-ida")).status).toBe(403);expect((await run("suffolk-ida")).status).toBe(403);
 });
 it("collects and filters Suffolk independently while keeping Nassau unchanged",async()=>{
  await check();
  const run=()=>refresh.POST(new Request("http://localhost/api/vision/discovery/refresh?source=suffolk-planning",{method:"POST"}));
  expect((await run()).status).toBe(200);
  expect(fetchRecords).toHaveBeenCalledTimes(1);expect(fetchSuffolk).toHaveBeenCalledTimes(1);
  const suffolk=await (await inbox.GET(new Request("http://localhost?source=suffolk-planning"))).json();
  expect(suffolk.candidates).toHaveLength(1);expect(suffolk.candidates[0].snapshot.county).toBe("Suffolk");
  expect((await listed())[0].snapshot.county).toBe("Nassau");
  await age();fetchSuffolk.mockRejectedValue(new Error("Unreadable PDF"));expect((await run()).status).toBe(502);
  const after=await (await inbox.GET(new Request("http://localhost?source=suffolk-planning"))).json();
  expect(after.candidates).toEqual(suffolk.candidates);expect(after.source.last_success_at).toBe(suffolk.source.last_success_at);expect(after.source.last_error).toContain("incomplete");
  expect((await inbox.GET(new Request("http://localhost?source=unsupported"))).status).toBe(400);
  expect((await refresh.POST(new Request("http://localhost?source=unsupported",{method:"POST"}))).status).toBe(400);
 });
 it("links separate filings to one opportunity without changing notes and rejects another target",async()=>{
  await check();const [first]=await listed();const saved=await (await review(first.id)).json();
  await db.query("update vision_opportunities set notes='Keep human notes' where id=$1",[saved.opportunity_id]);
  const workflow={opportunityId:saved.opportunity_id,revision:1,classification:"opportunity",decision:"watching",reviewDate:"2026-09-10",nextAction:null,people:[],activity:[]};
  await db.query("insert into vision_workflows(opportunity_id,revision,state) values($1,1,$2::jsonb)",[saved.opportunity_id,JSON.stringify(workflow)]);
  await age();fetchRecords.mockResolvedValue([{...source,externalId:"second-filing"}]);await check();const [second]=await listed();
  const link=()=>detail.POST(req({action:"accept",expectedRevision:1,opportunityId:saved.opportunity_id,notes:""}),ctx(second.id));
  expect((await link()).status).toBe(200);expect((await link()).status).toBe(200);
  expect((await db.query("select * from vision_opportunities")).rows).toHaveLength(1);
  expect((await db.query<{notes:string}>("select notes from vision_opportunities")).rows[0].notes).toBe("Keep human notes");
  const {opportunityEvidence}=await import("@/lib/vision/discovery");
  expect(await opportunityEvidence(db,saved.opportunity_id)).toHaveLength(2);
  expect((await db.query<{state:unknown}>("select state from vision_workflows where opportunity_id=$1",[saved.opportunity_id])).rows[0].state).toEqual(workflow);
  const other=(await db.query<{id:string}>("insert into vision_opportunities(name,town,county,source_title,source_url) values('Other','Town','Suffolk','Source','https://example.org') returning id")).rows[0];
  expect((await detail.POST(req({action:"accept",expectedRevision:1,opportunityId:other.id,notes:""}),ctx(second.id))).status).toBe(409);
  expect((await detail.POST(req({action:"accept",expectedRevision:1,opportunityId:"00000000-0000-4000-8000-000000000099",notes:""}),ctx(second.id))).status).toBe(400);
  expect((await detail.POST(req({action:"accept",expectedRevision:1,opportunityId:"not-an-id",notes:""}),ctx(second.id))).status).toBe(400);
 });
 it("retains evidence versions while keeping evidence text out of inbox rows",async()=>{
  const evidence={url:"https://www.suffolkcountyny.gov/Portals/0/test.pdf",title:"Public report",page:1,checksum:"a".repeat(64),text:"File Number HU-26-05"};
  fetchSuffolk.mockResolvedValue([{...source,county:"Suffolk",details:{"Collection year":"2025"},evidence:[evidence]}]);
  const run=()=>refresh.POST(new Request("http://localhost?source=suffolk-planning",{method:"POST"}));
  await run();
  const response=await (await inbox.GET(new Request("http://localhost?source=suffolk-planning"))).json();
  const item=response.candidates[0];expect(item.snapshot.evidence).toBeUndefined();expect(response.source.coverage.documents).toEqual([evidence.url]);expect(response.source.coverage.year).toBe(2025);
  const record=()=>detail.GET(req(),ctx(item.id)).then(response=>response.json());
  expect((await record()).candidate.snapshot.evidence).toEqual([evidence]);
  await age();await run();expect((await record()).history).toHaveLength(1);
  await age();fetchSuffolk.mockResolvedValue([{...source,county:"Suffolk",evidence:[{...evidence,checksum:"b".repeat(64),text:"Revised report"}]}]);await run();
  const updated=await record();expect(updated.history).toHaveLength(2);expect(updated.history[1].snapshot.evidence).toEqual([evidence]);
 });
 it("keeps unresolved documents and policy context out of new opportunities",async()=>{
  for(const marker of [{identityStatus:"unresolved"},{classification:"policy"}]){
   await age();fetchRecords.mockResolvedValue([{...source,externalId:JSON.stringify(marker),...marker}]);await check();
   const record=(await listed()).find((item:{external_id:string})=>item.external_id===JSON.stringify(marker));
   expect((await review(record.id)).status).toBe(400);
   expect((await db.query("select * from vision_opportunities")).rows).toHaveLength(0);
  }
 });
 it("combines application, location and inclusive source-date filters",async()=>{
  fetchRecords.mockResolvedValue([
   {...source,externalId:"first",sourceDate:"2026-08-01",details:{"Record type":"Zoning referral"}},
   {...source,externalId:"last",sourceDate:"2026-08-31",details:{"Record type":"Zoning referral"}},
   {...source,externalId:"other-type",details:{"Record type":"Major subdivision"}},
   {...source,externalId:"outside",sourceDate:"2026-07-31",details:{"Record type":"Zoning referral"}},
   {...source,externalId:"unknown",sourceDate:null,details:{"Record type":"Zoning referral"}},
  ]);await check();
  const query=async(params:Record<string,string>)=>(await (await inbox.GET(new Request(`http://localhost?${new URLSearchParams(params)}`))).json());
  const matched=await query({applicationType:"Zoning referral",location:"TEST ADDRESS",from:"2026-08-01",to:"2026-08-31"});
  expect(matched.candidates.map((x:{external_id:string})=>x.external_id)).toEqual(["last","first"]);
  expect(matched.applicationTypes).toEqual(["Major subdivision","Zoning referral"]);
  expect((await query({location:"nassau",dateMode:"unknown"})).candidates.map((x:{external_id:string})=>x.external_id)).toEqual(["unknown"]);
  expect((await query({location:"test town",dateMode:"known"})).candidates).toHaveLength(4);
  expect((await query({location:"%"})).candidates).toEqual([]);
  expect((await query({})).candidates).toHaveLength(5);
 });
 it("filters before the source result limit",async()=>{
  fetchRecords.mockResolvedValue(Array.from({length:300},(_,i)=>({...source,externalId:`record-${i}`,sourceDate:i===299?"2020-01-01":"2026-08-01",address:i===299?"Unique older address":"Common address",details:{"Record type":i===299?"Minor subdivision":"Zoning referral"}})));
  await check();
  const result=await (await inbox.GET(new Request("http://localhost?applicationType=Minor%20subdivision&location=Unique&to=2020-01-01"))).json();
  expect(result.candidates).toHaveLength(1);expect(result.candidates[0].external_id).toBe("record-299");
 });
 it("rejects malformed and conflicting date filters",async()=>{
  for(const query of ["from=2026-02-30","to=invalid","from=0000-01-01","from=2026-09-01&to=2026-08-01","dateMode=unknown&from=2026-01-01","dateMode=invalid",`location=${"x".repeat(401)}`]){
   expect((await inbox.GET(new Request(`http://localhost?${query}`))).status).toBe(400);
  }
 });

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
  for(const bad of [null,[{...source,externalId:""}],[{...source,sourceUrl:"javascript:alert(1)"}],[source,source],[{...source,details:{x:4}}]]){
   await age();fetchRecords.mockResolvedValue(bad);expect((await check()).status).toBe(502);const after=await (await inbox.GET(req())).json();expect(after.candidates).toEqual(before.candidates);expect(after.source.last_success_at).toBe(before.source.last_success_at);expect(after.source.last_error).toContain("failed");
  }
  await age();fetchRecords.mockRejectedValue(new Error("Private upstream error"));expect((await check()).status).toBe(502);
 });
 it("records an empty result without deleting previous candidates",async()=>{await check();await age();fetchRecords.mockResolvedValue([]);const response=await check();expect(response.status).toBe(200);expect((await response.json()).outcome).toBe("completed_empty");const result=await (await inbox.GET(req())).json();expect(result.candidates).toHaveLength(1);expect(result.source.record_count).toBe(0);});
 it("records bounded adapter progress when a source fails partway",async()=>{
  const sourceId="nassau-village-hempstead-records";
  const coverage={year:2026,documents:["https://www.villageofhempstead.org/AgendaCenter/ViewFile/Agenda/_07202026-1174"]};
  fetchCivicPlus.mockRejectedValue(new SourceCollectionFailure("The source document changed.",{coverage,fetched:7,rejected:1}));
  const response=await refresh.POST(new Request(`http://localhost/api/vision/discovery/refresh?source=${sourceId}`,{method:"POST"}));
  expect(response.status).toBe(502);
  const run=(await db.query<{coverage:unknown;fetched_count:number;rejected_count:number}>("select coverage,fetched_count,rejected_count from vision_discovery_runs where source_id=$1",[sourceId])).rows[0];
  expect(run).toEqual({coverage,fetched_count:7,rejected_count:1});
 });
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
  vi.stubEnv("KULKA_AUTH_BYPASS","1");const call=(token:string,sourceId?:string)=>cron.POST(new Request(`http://localhost${sourceId?`?source=${sourceId}`:""}`,{method:"POST",headers:{authorization:`Bearer ${token}`}}));
  vi.stubEnv("VISION_DISCOVERY_CRON_SECRET","");expect((await call("")).status).toBe(401);vi.stubEnv("VISION_DISCOVERY_CRON_SECRET","short");expect((await call("short")).status).toBe(401);
  vi.stubEnv("VISION_DISCOVERY_CRON_SECRET","a".repeat(32));expect((await call("b".repeat(32))).status).toBe(401);expect((await call("é".repeat(32))).status).toBe(401);expect((await call("a".repeat(32),"nassau-applications")).status).toBe(200);
  expect(fetchRecords).toHaveBeenCalledTimes(1);expect((await call("a".repeat(32),"suffolk-planning")).status).toBe(200);expect(fetchSuffolk).toHaveBeenCalledTimes(1);expect((await call("a".repeat(32),"nassau-town-oyster-bay-records")).status).toBe(200);expect(fetchOysterBayZba).toHaveBeenCalledTimes(1);expect((await call("a".repeat(32),"unsupported")).status).toBe(400);
 });
 it("runs all enabled sources with separate stored outcomes",async()=>{
  vi.stubEnv("VISION_DISCOVERY_CRON_SECRET","a".repeat(32));
  fetchSuffolk.mockRejectedValue(new Error("authorization: Bearer private-upstream-token"));
  fetchNassauIda.mockResolvedValue([]);
  fetchCivicPlus.mockImplementation(async sourceDefinition=>{
   if(sourceDefinition.id==="nassau-village-hempstead-zoning-records")throw new Error("private CivicPlus response body");
   return {records:[{...source,externalId:"civicplus-case"}],coverage:{year:2026,documents:["https://example.org/agenda.pdf"]}};
  });
  const response=await cron.POST(new Request("http://localhost?source=all",{method:"POST",headers:{authorization:`Bearer ${"a".repeat(32)}`}}));
  expect(response.status).toBe(200);
  const body=await response.json();
  expect(body.results.map((item:{sourceId:string;outcome:string})=>[item.sourceId,item.outcome])).toEqual([
   ["nassau-applications","completed"],
   ["suffolk-planning","failed"],
   ["nassau-ida","completed_empty"],
   ["suffolk-ida","completed"],
   ["nassau-town-oyster-bay-records","completed"],
   ["nassau-village-hempstead-records","completed"],
   ["nassau-village-hempstead-zoning-records","failed"],
   ["nassau-village-garden-city-records","completed"],
   ["hempstead-village-smartgov","completed"],
  ]);
  expect(fetchRecords).toHaveBeenCalledTimes(1);expect(fetchSuffolk).toHaveBeenCalledTimes(1);expect(fetchNassauIda).toHaveBeenCalledTimes(1);expect(fetchSuffolkIda).toHaveBeenCalledTimes(1);expect(fetchOysterBayZba).toHaveBeenCalledTimes(1);expect(fetchCivicPlus).toHaveBeenCalledTimes(3);expect(fetchSmartGov).toHaveBeenCalledTimes(1);
  const runs=(await db.query<{source_id:string;outcome:string;fetched_count:number;error_summary:string|null}>("select source_id,outcome,fetched_count,error_summary from vision_discovery_runs order by started_at,source_id")).rows;
  expect(runs).toHaveLength(9);
  expect(runs.find(run=>run.source_id==="nassau-ida")).toMatchObject({outcome:"completed_empty",fetched_count:0,error_summary:null});
  expect(runs.find(run=>run.source_id==="suffolk-planning")?.error_summary).not.toContain("private-upstream-token");
  expect(runs.find(run=>run.source_id==="nassau-village-hempstead-zoning-records")?.error_summary).not.toContain("private CivicPlus response body");
  expect((await db.query("select * from vision_discovery_candidates")).rows).toHaveLength(6);
 });
 it("records insert, unchanged, update, failure, and blocked attempts without changing prior records",async()=>{
  expect((await check()).status).toBe(200);
  await age();expect((await check()).status).toBe(200);
  await age();fetchRecords.mockResolvedValue([{...source,name:"Changed source name"}]);expect((await check()).status).toBe(200);
  let release!:(records:typeof source[])=>void;await age();fetchRecords.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const active=check();
  for(let attempt=0;attempt<100 && !release;attempt++)await new Promise(resolve=>setTimeout(resolve,1));
  expect((await check()).status).toBe(409);release([{...source,name:"Changed source name"}]);expect((await active).status).toBe(200);
  await age();fetchRecords.mockRejectedValue(new Error("password=never-store-this"));expect((await check()).status).toBe(502);
  const runs=(await db.query<{outcome:string;inserted_count:number;updated_count:number;unchanged_count:number;error_summary:string|null;coverage_start_date:string|null;coverage_end_date:string|null}>("select outcome,inserted_count,updated_count,unchanged_count,error_summary,coverage_start_date::text,coverage_end_date::text from vision_discovery_runs order by started_at,id")).rows;
  expect(runs.map(run=>run.outcome).sort()).toEqual(["blocked","completed","completed","completed","completed","failed"]);
  expect(runs[0]).toMatchObject({inserted_count:1,updated_count:0,unchanged_count:0,coverage_start_date:"2026-08-01",coverage_end_date:"2026-08-01"});
  expect(runs[1]).toMatchObject({inserted_count:0,updated_count:0,unchanged_count:1});
  expect(runs[2]).toMatchObject({inserted_count:0,updated_count:1,unchanged_count:0});
  expect(runs.find(run=>run.outcome==="failed")?.error_summary).not.toContain("never-store-this");
  expect((await listed())[0].snapshot.name).toBe("Changed source name");
 });
 it("rejects request supplied collection settings before a source fetch",async()=>{
  vi.stubEnv("VISION_DISCOVERY_CRON_SECRET","a".repeat(32));
  for(const query of ["source=unknown","source=nassau-applications&origin=https://evil.test","url=https://evil.test/feed"]){
   const response=await cron.POST(new Request(`http://localhost?${query}`,{method:"POST",headers:{authorization:`Bearer ${"a".repeat(32)}`}}));
   expect(response.status).toBe(400);
  }
  expect(fetchRecords).not.toHaveBeenCalled();expect(fetchSuffolk).not.toHaveBeenCalled();expect(fetchNassauIda).not.toHaveBeenCalled();expect(fetchSuffolkIda).not.toHaveBeenCalled();expect(fetchOysterBayZba).not.toHaveBeenCalled();expect(fetchCivicPlus).not.toHaveBeenCalled();expect(fetchSmartGov).not.toHaveBeenCalled();
 });
 it("enables RLS without browser policies on each discovery table",async()=>{
  for(const table of ["vision_discovery_sources","vision_discovery_candidates","vision_discovery_history","vision_discovery_runs"]){expect((await db.query<{relrowsecurity:boolean}>("select relrowsecurity from pg_class where relname=$1",[table])).rows[0].relrowsecurity).toBe(true);expect((await db.query("select * from pg_policies where tablename=$1",[table])).rows).toEqual([]);}
 });
});

describe("combined source selection",()=>{
 it("combines selected results with stable dates and source IDs while preserving saved opportunities",async()=>{
  fetchRecords.mockResolvedValue([{...source,sourceDate:"2026-08-01"}]);
  fetchSuffolk.mockResolvedValue([{...source,externalId:"suffolk-test",county:"Suffolk",sourceDate:"2026-08-02"}]);
  await check();await refresh.POST(new Request("http://localhost?source=suffolk-planning",{method:"POST"}));
  const query=async(sources:string,state="new")=>(await (await inbox.GET(new Request(`http://localhost?${new URLSearchParams({sources,state})}`))).json());
  const combined=await query("nassau-applications,suffolk-planning");
  expect(combined.candidates.map((item:{source_id:string})=>item.source_id)).toEqual(["suffolk-planning","nassau-applications"]);
  expect((await query("suffolk-planning,nassau-applications")).candidates).toEqual(combined.candidates);
  expect(Object.keys(combined.sources)).toEqual(["nassau-applications","suffolk-planning"]);
  expect((await query("suffolk-planning")).candidates).toHaveLength(1);
  const nassau=combined.candidates[1];await review(nassau.id);
  const tracked=(await db.query("select * from vision_opportunities")).rows;expect(tracked).toHaveLength(1);
  expect((await query("")).candidates).toEqual([]);
  expect((await db.query("select * from vision_opportunities")).rows).toEqual(tracked);
  expect((await detail.GET(req(),ctx(nassau.id))).status).toBe(200);
  expect((await inbox.GET(new Request("http://localhost?sources=unknown"))).status).toBe(400);
  expect((await inbox.GET(new Request("http://localhost?sources=&state=invalid"))).status).toBe(400);
 });
 it("keeps other source records available when one source cannot be read",async()=>{
  await check();
  const {selectedDiscoveryInbox}=await import("@/lib/vision/selected-discovery");
  const {parseDiscoveryFilters}=await import("@/lib/vision/discovery-filters");
  const partial:Db={query:async(text,params)=>{if(params?.includes("suffolk-planning"))throw new Error("Synthetic unavailable source");return db.query(text,params);}};
  const result=await selectedDiscoveryInbox(partial,["nassau-applications","suffolk-planning"],"new",parseDiscoveryFilters(new URLSearchParams()));
  expect(result.candidates).toHaveLength(1);expect(result.candidates[0].source_id).toBe("nassau-applications");
  expect(result.sourceErrors["suffolk-planning"]).toBeTruthy();expect(result.sources["nassau-applications"]).not.toBeNull();
 });
 it("keeps successful checks and old failed-source records in the combined view",async()=>{
  fetchSuffolk.mockResolvedValue([{...source,county:"Suffolk"}]);fetchNassauIda.mockReset();fetchSuffolkIda.mockReset();fetchNassauIda.mockResolvedValue([{...source,externalId:"ida-project"}]);fetchSuffolkIda.mockResolvedValue([{...source,externalId:"ida-document",county:"Suffolk"}]);
  const suffolk=()=>refresh.POST(new Request("http://localhost?source=suffolk-planning",{method:"POST"}));
  await suffolk();await age();fetchSuffolk.mockRejectedValue(new Error("Synthetic PDF failure"));
  const {checkSelectedSources}=await import("@/lib/vision/source-selection");
  const outcomes:Record<string,string>={};
  await checkSelectedSources(["nassau-applications","suffolk-planning"],async id=>{
    const response=await refresh.POST(new Request(`http://localhost?source=${id}`,{method:"POST"}));const result=await response.json();if(!response.ok)throw new Error(result.error);return result;
  },(id,result)=>{outcomes[id]=result.status;});
  expect(outcomes).toEqual({"nassau-applications":"success","suffolk-planning":"error"});
  const result=await (await inbox.GET(new Request("http://localhost?sources=nassau-applications,suffolk-planning"))).json();
  expect(result.candidates).toHaveLength(2);expect(result.sources["suffolk-planning"].last_error).toBeTruthy();
 });
});
