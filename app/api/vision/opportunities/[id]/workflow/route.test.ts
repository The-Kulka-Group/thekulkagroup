import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { seededDatabase } from "@/test/database";
import type { Db } from "@/lib/db";
import type { Workflow } from "@/lib/vision/workflow-types";
let db: Awaited<ReturnType<typeof seededDatabase>>;
vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));
const { GET, POST } = await import("./route");
const legacy = await import("../route");
const {createVisionOpportunity} = await import("@/lib/vision/opportunities");
const {listWorkflowSummaries} = await import("@/lib/vision/workflow");
let id: string;
const draft = {name:"Synthetic opportunity",town:"Test town",county:"Test county",address:"",latitude:null,longitude:null,sourceTitle:"Synthetic source",sourceUrl:"https://example.org",sourceDate:null,notes:"Keep legacy notes."};
const context = (record=id) => ({params:Promise.resolve({id:record})});
const request = (method:string, body?:unknown, auth?:string) => new Request("http://localhost/api/vision/opportunities/test/workflow",{method,headers:auth ? {"x-kulka-test-auth":auth} : {},body:body===undefined ? undefined : JSON.stringify(body)});
const read = async () => (await (await GET(request("GET"),context())).json());
const post = (body:unknown) => POST(request("POST",body),context());
const change = async (body:Record<string,unknown>): Promise<Workflow> => {
 const before = await read();
 const response = await post({...body,expectedRevision:before.workflow.revision});
 expect(response.status).toBe(200);
 return (await response.json()).workflow;
};
const nextAction = {title:"Call planning staff",assigneeEmail:"browser-test@kulka.invalid",dueDate:"2026-09-09"};
beforeAll(async()=> {db=await seededDatabase();},60000);
beforeEach(async()=> {vi.stubEnv("KULKA_AUTH_BYPASS","");vi.stubEnv("KULKA_AUTH_ALLOWED_EMAILS","colleague@kulka.com,one@kulka.com,two@kulka.com,three@kulka.com,four@kulka.com");await db.query("truncate vision_opportunities,vision_people restart identity cascade");id=(await createVisionOpportunity(db,draft)).id;});
afterEach(()=>vi.unstubAllEnvs());
afterAll(async()=>{await db?.close();});
describe("private opportunity workflow",()=>{
 it("persists decisions, people, assignment, result replacement and outcome without changing legacy data",async()=>{
  expect((await read()).workflow).toMatchObject({revision:0,decision:"undecided",people:[],activity:[],reviewDate:null});
  let workflow=await change({type:"decision",decision:"pursuing"});
  expect(workflow.people).toEqual([]);
  workflow=await change({type:"person",person:{name:"Synthetic contact",company:"Test company",role:"Project architect"},actorId:"forged"});
  expect(workflow.people[0]).toMatchObject({name:"Synthetic contact",role:"Project architect"});
  expect((await read()).people[0].role).toBe("");
  workflow=await change({type:"action",action:nextAction});
  const firstActionId=workflow.nextAction!.id;
  workflow=await change({type:"result",result:"They asked for a call next week.",nextAction:{...nextAction,title:"Follow up",assigneeEmail:"colleague@kulka.com"}});
  expect(workflow.nextAction).toMatchObject({title:"Follow up",assigneeEmail:"colleague@kulka.com"});
  expect(workflow.nextAction!.id).not.toBe(firstActionId);
  expect(workflow.activity.at(-1)?.description).toContain("Completed: Call planning staff");
  expect(workflow.activity.every(event=>event.actorId==="test-user" && event.actorEmail==="browser-test@kulka.invalid" && Number.isFinite(Date.parse(event.createdAt)))).toBe(true);
  workflow=await change({type:"result",result:"Contract awarded.",outcome:"won",awardEvidence:"Executed contract recorded in project files."});
  expect(workflow).toMatchObject({revision:5,decision:"won",nextAction:null});
  expect(workflow.activity.at(-1)?.description).toContain("Executed contract");
  expect((await read()).workflow).toEqual(workflow);
  const opportunity=(await(await legacy.GET(request("GET"),context())).json()).opportunity;
  expect(opportunity).toMatchObject({notes:draft.notes,status:"open",revision:1});
  expect(opportunity).not.toHaveProperty("people");
  expect((await listWorkflowSummaries(db,[id]))[0]).toEqual(workflow);
 });
 it("rejects stale writes and rolls back an inline person on a revision race",async()=>{
  const results=await Promise.all([post({type:"person",person:{name:"One"},expectedRevision:0}),post({type:"person",person:{name:"Two"},expectedRevision:0})]);
  expect(results.map(item=>item.status).sort()).toEqual([200,409]);
  expect((await read()).people).toHaveLength(1);
  expect((await read()).workflow.activity).toHaveLength(1);
  expect((await post({type:"decision",decision:"watching",expectedRevision:0})).status).toBe(409);
 });
 it("enforces policy context and closes work when passed",async()=>{
  await change({type:"classification",classification:"policy"});
  for(const decision of ["pursuing","won","lost"]) expect((await post({type:"decision",decision,expectedRevision:1})).status).toBe(400);
  await change({type:"decision",decision:"watching"});
  await change({type:"action",action:nextAction});
  expect((await post({type:"result",result:"Awarded",outcome:"won",awardEvidence:"Contract",expectedRevision:3})).status).toBe(400);
  await change({type:"reviewDate",reviewDate:"2026-10-01"});
  const workflow=await change({type:"decision",decision:"passed"});
  expect(workflow).toMatchObject({nextAction:null,reviewDate:null,decision:"passed"});
  expect((await post({type:"action",action:nextAction,expectedRevision:5})).status).toBe(400);
  await change({type:"decision",decision:"watching"});
  await change({type:"classification",classification:"opportunity"});
  await change({type:"decision",decision:"pursuing"});
  expect((await post({type:"classification",classification:"policy",expectedRevision:8})).status).toBe(400);
 });
 it("keeps open work unchanged when a replacement fails validation, then records a loss",async()=>{
  await change({type:"decision",decision:"pursuing"});
  const before=await change({type:"action",action:nextAction});
  expect((await post({type:"result",result:"Reached the owner",nextAction:{...nextAction,assigneeEmail:"unknown@example.org"},expectedRevision:before.revision})).status).toBe(400);
  expect((await read()).workflow).toEqual(before);
  const lost=await change({type:"result",result:"Owner selected another team.",outcome:"lost"});
  expect(lost).toMatchObject({decision:"lost",nextAction:null});
  const reopened=await change({type:"decision",decision:"pursuing"});
  expect(reopened.activity).toHaveLength(4);
  expect(reopened.nextAction).toBeNull();
 });
 it("links existing people with a role per opportunity and supports corrections without deleting contacts",async()=>{
  const first=await change({type:"person",person:{name:"Shared contact",role:"Owner"}});
  const personId=first.people[0].id;
  id=(await createVisionOpportunity(db,{...draft,name:"Second opportunity"})).id;
  let workflow=await change({type:"person",personId,role:"Advisor"});
  expect(workflow.people[0].role).toBe("Advisor");
  expect((await post({type:"person",personId,expectedRevision:1})).status).toBe(400);
  await change({type:"decision",decision:"watching"});
  await change({type:"action",action:nextAction});
  workflow=await change({type:"cancelAction"});
  expect(workflow.nextAction).toBeNull();
  workflow=await change({type:"unlinkPerson",personId});
  expect(workflow.people).toEqual([]);
  expect((await read()).people).toHaveLength(1);
 });
 it.each([
  {type:"action",action:{...nextAction,assigneeEmail:"outsider@example.org"}},
  {type:"action",action:{...nextAction,dueDate:"2026-02-30"}},
  {type:"action",action:{...nextAction,title:""}},
  {type:"reviewDate",reviewDate:"0000-01-01"},
  {type:"result",result:"",nextAction},
  {type:"result",result:"Won",outcome:"won"},
  {type:"result",result:"Won",outcome:"won",awardEvidence:"Contract",nextAction},
  {type:"person",person:{name:""}},
  {type:"person",personId:"00000000-0000-4000-8000-000000000099"},
  {type:"decision",decision:"invented"},
  {type:"classification",classification:"other"},
 ])("rejects invalid changes without touching the workflow: %j",async body=>{
  await change({type:"decision",decision:"watching"});
  expect((await post({...body,expectedRevision:1})).status).toBe(400);
  expect((await read()).workflow.revision).toBe(1);
 });
 it("requires a revision and accepts action due dates without turning them into timestamps",async()=>{
  expect((await post({type:"action",action:nextAction})).status).toBe(400);
  await change({type:"decision",decision:"watching"});
  expect((await change({type:"action",action:{...nextAction,dueDate:null}})).nextAction?.dueDate).toBeNull();
  expect((await change({type:"action",action:nextAction})).nextAction?.dueDate).toBe("2026-09-09");
 });
 it("denies private reads and writes to temporary, signed-out and forbidden users",async()=>{
  await change({type:"person",person:{name:"Private contact"}});
  for(const [auth,status] of [["signed-out",401],["forbidden",403]] as const){
   expect((await GET(request("GET",undefined,auth),context())).status).toBe(status);
   expect((await POST(request("POST",{type:"decision",decision:"watching",expectedRevision:1},auth),context())).status).toBe(status);
  }
  vi.stubEnv("KULKA_AUTH_BYPASS","1");
  expect((await GET(request("GET"),context())).status).toBe(403);
  expect((await post({type:"decision",decision:"watching",expectedRevision:1})).status).toBe(403);
  for(const table of ["vision_workflows","vision_people"]){
   expect((await db.query<{relrowsecurity:boolean}>("select relrowsecurity from pg_class where relname=$1",[table])).rows[0].relrowsecurity).toBe(true);
   expect((await db.query("select * from pg_policies where tablename=$1",[table])).rows).toEqual([]);
  }
 });
 it("requires an active decision before assigning work or recording results",async()=>{
  for(const body of [{type:"action",action:nextAction},{type:"result",result:"Called"},{type:"result",result:"Awarded",outcome:"won",awardEvidence:"Executed agreement"},{type:"reviewDate",reviewDate:"2026-10-01"}]){
   expect((await post({...body,expectedRevision:0})).status).toBe(400);
  }
  expect((await read()).workflow.revision).toBe(0);
  await change({type:"decision",decision:"watching"});
  await change({type:"reviewDate",reviewDate:"2026-10-01"});
  let workflow=await change({type:"decision",decision:"pursuing"});
  expect(workflow.reviewDate).toBeNull();
  expect((await post({type:"reviewDate",reviewDate:"2026-10-02",expectedRevision:3})).status).toBe(400);
  await change({type:"action",action:nextAction});
  workflow=await change({type:"decision",decision:"passed"});
  expect(workflow.activity.at(-1)?.description).toContain("Cancelled action: Call planning staff. Assigned to browser-test@kulka.invalid, due 2026-09-09.");
  expect((await post({type:"reviewDate",reviewDate:"2026-10-02",expectedRevision:5})).status).toBe(400);
 });
 it("rejects unsupported control characters before PostgreSQL and keeps the existing workflow",async()=>{
  await change({type:"decision",decision:"watching"});
  for(const body of [{type:"person",person:{name:"Bad\u0000name"}},{type:"action",action:{...nextAction,title:"Bad\u0001action"}},{type:"result",result:"Bad\u007fresult"},{type:"person",person:{name:"Person",role:"Bad\u000brole"}}]){
   expect((await post({...body,expectedRevision:1})).status).toBe(400);
  }
  expect((await read()).workflow.revision).toBe(1);
  expect((await read()).people).toEqual([]);
  expect((await change({type:"result",result:"First line.\nSecond line."})).activity.at(-1)?.description).toContain("First line.\nSecond line.");
 });
 it("handles malformed JSON and missing opportunities",async()=>{
  expect((await POST(new Request("http://localhost",{method:"POST",body:"{"}),context())).status).toBe(400);
  for(const record of ["invalid","00000000-0000-4000-8000-000000000099"]){
   expect((await GET(request("GET"),context(record))).status).toBe(404);
   expect((await POST(request("POST",{type:"decision",decision:"watching",expectedRevision:0}),context(record))).status).toBe(404);
  }
 });
});
