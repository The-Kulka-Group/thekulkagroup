import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {seededDatabase} from "@/test/database";
import {groupSourceMapPoints, partitionMapPoints} from "@/lib/vision/map-points";
import type {Db} from "@/lib/db";
import {createVisionOpportunity,getVisionOpportunity} from "@/lib/vision/opportunities";
let db:Awaited<ReturnType<typeof seededDatabase>>;
vi.mock("@/lib/db",()=>({getDb:()=>db as Db}));
const {PATCH}=await import("./route");
const detail=await import("../route");
const lookup=await import("../../../location-lookup/route");
const context=(id:string)=>({params:Promise.resolve({id})});
const request=(body:unknown,auth?:string)=>new Request("http://localhost/api/vision/location",{method:"PATCH",headers:auth?{"x-kulka-test-auth":auth}:{},body:JSON.stringify(body)});
const draft={name:"Synthetic location fixture",town:"Test town",county:"Test county",address:"",latitude:null,longitude:null,sourceTitle:"Test source",sourceUrl:"https://example.org",sourceDate:null,notes:"Keep these notes."};
beforeAll(async()=>{db=await seededDatabase();},60000);
beforeEach(async()=>{vi.stubEnv("KULKA_AUTH_BYPASS","");await db.query("truncate vision_opportunities cascade");});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});afterAll(async()=>{await db?.close();});
describe("location review",()=>{
  it("saves and clears only location fields, rejects stale source forms and leaves workflow untouched",async()=>{
    const original=await createVisionOpportunity(db,draft);
    await db.query("insert into vision_workflows(opportunity_id,revision,state) values($1,1,$2)",[original.id,JSON.stringify({decision:"pursuing",notes:"Synthetic workflow fixture"})]);
    const workflowBefore=(await db.query("select * from vision_workflows where opportunity_id=$1",[original.id])).rows;
    const location={address:"1 Test St, Test Town, NY",latitude:40.8,longitude:-73.4,expectedRevision:original.revision};
    const response=await PATCH(request(location),context(original.id));expect(response.status).toBe(200);
    const saved=(await response.json()).opportunity;expect(saved).toMatchObject({...draft,address:location.address,latitude:location.latitude,longitude:location.longitude,revision:2,notes:draft.notes,status:"open",sourceUrl:original.sourceUrl});
    expect(groupSourceMapPoints(partitionMapPoints([saved]).source,()=>({x:0,y:0}))[0]).toMatchObject({points:[expect.objectContaining(saved)]});
    expect((await PATCH(request(location),context(original.id))).status).toBe(409);
    expect((await detail.PATCH(request({...draft,status:"open",expectedRevision:1}),context(original.id))).status).toBe(409);
    expect((await db.query("select * from vision_workflows where opportunity_id=$1",[original.id])).rows).toEqual(workflowBefore);
    expect((await PATCH(request({...location,latitude:null,longitude:null,expectedRevision:2}),context(original.id))).status).toBe(200);
    expect(await getVisionOpportunity(db,original.id)).toMatchObject({latitude:null,longitude:null,address:location.address,notes:draft.notes,revision:3});
  });
  it("rejects invalid or unrelated fields, missing records and temporary writers",async()=>{
    const original=await createVisionOpportunity(db,draft);
    const location={address:"Test",latitude:40.8,longitude:-73.4,expectedRevision:1};
    for(const invalid of [{latitude:91},{longitude:null},{latitude:"40"},{expectedRevision:0},{notes:"Overwrite"},{address:null}])expect((await PATCH(request({...location,...invalid}),context(original.id))).status).toBe(400);
    expect((await PATCH(request(location),context("00000000-0000-4000-8000-000000000099"))).status).toBe(404);
    for(const [auth,status] of [["signed-out",401],["forbidden",403]] as const){expect((await PATCH(request(location,auth),context(original.id))).status).toBe(status);expect((await lookup.POST(request({address:"Test"},auth))).status).toBe(status);}
    vi.stubEnv("KULKA_AUTH_BYPASS","1");expect((await PATCH(request(location),context(original.id))).status).toBe(403);expect((await lookup.POST(request({address:"Test"}))).status).toBe(403);
  });
  it("lookup matches, no matches and failures preserve a saved pin",async()=>{
    const original=await createVisionOpportunity(db,{...draft,latitude:40.8,longitude:-73.4});
    for(const fixture of [{result:{addressMatches:[]}},{result:{addressMatches:[{matchedAddress:"1 Test St",coordinates:{x:-73,y:40}}]}}]){
      vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture))));expect((await lookup.POST(request({address:"1 Test St, Town, NY"}))).status).toBe(200);expect(await getVisionOpportunity(db,original.id)).toEqual(original);
    }
    vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("offline")));expect((await lookup.POST(request({address:"1 Test St, NY"}))).status).toBe(502);expect(await getVisionOpportunity(db,original.id)).toEqual(original);
    expect((await lookup.POST(request({address:""}))).status).toBe(400);
  });
});
