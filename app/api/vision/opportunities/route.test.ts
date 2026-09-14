import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { seededDatabase } from "@/test/database";
import type { Db } from "@/lib/db";
let db: Awaited<ReturnType<typeof seededDatabase>>;
vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));
const { GET, POST } = await import("./route");
const detail = await import("./[id]/route");
const base = "http://localhost/api/vision/opportunities";
const draft = { name:"Synthetic development opportunity",town:"Test town",county:"Test county",address:"",latitude:null,longitude:null,sourceTitle:"Synthetic planning notice",sourceUrl:"https://example.org/notice",sourceDate:"2026-09-01",notes:"Review the hearing notice." };
const context = (id:string) => ({params:Promise.resolve({id})});
const request = (method:string,body?:unknown,auth?:string) => new Request(base,{method,headers:auth ? {"x-kulka-test-auth":auth} : {},body:body === undefined ? undefined : JSON.stringify(body)});
const create = async (body:unknown=draft) => POST(request("POST",body));
beforeAll(async () => { db = await seededDatabase(); }, 60000);
beforeEach(async () => { await db.query("truncate vision_opportunities restart identity cascade"); });
afterEach(() => { vi.unstubAllEnvs(); });
afterAll(async () => { await db?.close(); });
describe("Vision opportunities", () => {
  it("starts empty and saves, reopens, filters and updates a source-backed opportunity", async () => {
    expect((await (await GET(request("GET"))).json()).opportunities).toEqual([]);
    const response = await create(); expect(response.status).toBe(201);
    const {opportunity} = await response.json();
    expect(opportunity).toMatchObject({...draft,sheetNumber:"V-101",status:"open",revision:1,createdAt:expect.any(String)});
    expect((await (await detail.GET(request("GET"),context(opportunity.id))).json()).opportunity).toEqual(opportunity);
    await create({...draft,name:"Another fixture",county:"Other county",latitude:40.8,longitude:-73.4});
    const listed = await (await GET(new Request(`${base}?search=hearing&county=Test%20county&status=open`))).json();
    expect(listed.opportunities.map((item:{id:string})=>item.id)).toEqual([opportunity.id]);
    expect((await (await GET(new Request(`${base}?search=v-101`))).json()).opportunities.map((item:{id:string})=>item.id)).toEqual([opportunity.id]);
    expect((await (await GET(new Request(`${base}?search=%25`))).json()).opportunities).toEqual([]);
    const saved = await detail.PATCH(request("PATCH",{...draft,latitude:41.2,longitude:-73.5,notes:"The source needs a follow-up.",status:"working",expectedRevision:1}),context(opportunity.id));
    expect(saved.status).toBe(200);
    const updated = (await saved.json()).opportunity;
    expect(updated).toMatchObject({latitude:41.2,longitude:-73.5,notes:"The source needs a follow-up.",status:"working",revision:2});
    expect(updated.updatedAt >= opportunity.updatedAt).toBe(true);
    const review = {notes:"Review is complete.",status:"done",expectedRevision:2};
    expect((await detail.PATCH(request("PATCH",review),context(opportunity.id))).status).toBe(200);
    expect((await detail.PATCH(request("PATCH",review),context(opportunity.id))).status).toBe(409);
    expect((await (await detail.GET(request("GET"),context(opportunity.id))).json()).opportunity).toMatchObject({notes:review.notes,status:"done",latitude:41.2,revision:3});
  });
  it.each([
    {name:""},{town:""},{county:""},{sourceTitle:""},{sourceUrl:"javascript:alert(1)"},{sourceUrl:"data:text/html,test"},
    {sourceUrl:"https://user:password@example.org"},{sourceDate:"2026-02-30"},{sourceDate:"09/01/2026"},
    {sourceDate:"0000-01-01"},{latitude:91,longitude:0},{latitude:1,longitude:null},{latitude:"41",longitude:-73},
    {latitude:0,longitude:181},{notes:"x".repeat(10001)},
  ])("rejects invalid source or location input %j", async invalid => {
    expect((await create({...draft,...invalid})).status).toBe(400);
    expect((await (await GET(request("GET"))).json()).opportunities).toEqual([]);
  });
  it("rejects malformed bodies, filters, IDs and missing records", async () => {
    expect((await POST(new Request(base,{method:"POST",body:"bad json"}))).status).toBe(400);
    expect((await create([])).status).toBe(400);
    expect((await GET(new Request(`${base}?status=approved`))).status).toBe(400);
    for (const id of ["bad-id","00000000-0000-4000-8000-000000000099"]) {
      expect((await detail.GET(request("GET"),context(id))).status).toBe(404);
      expect((await detail.PATCH(request("PATCH",{notes:"",status:"open",expectedRevision:1}),context(id))).status).toBe(404);
    }
    const {opportunity} = await (await create()).json();
    expect((await detail.PATCH(request("PATCH",{notes:"",status:"approved",expectedRevision:1}),context(opportunity.id))).status).toBe(400);
    expect((await detail.PATCH(request("PATCH",{notes:"",status:"open"}),context(opportunity.id))).status).toBe(400);
    expect((await detail.PATCH(request("PATCH",{notes:"",status:["done"],expectedRevision:1}),context(opportunity.id))).status).toBe(400);
    expect((await detail.PATCH(request("PATCH",{status:"done",expectedRevision:1}),context(opportunity.id))).status).toBe(400);
  });
  it("rejects signed-out and forbidden reads and writes", async () => {
    const {opportunity} = await (await create()).json();
    for (const [auth,status] of [["signed-out",401],["forbidden",403]] as const) {
      expect((await GET(request("GET",undefined,auth))).status).toBe(status);
      expect((await POST(request("POST",draft,auth))).status).toBe(status);
      expect((await detail.GET(request("GET",undefined,auth),context(opportunity.id))).status).toBe(status);
      expect((await detail.PATCH(request("PATCH",{notes:"",status:"done",expectedRevision:1},auth),context(opportunity.id))).status).toBe(status);
    }
  });
  it("protects the table from browser access and rejects incomplete coordinates in SQL", async () => {
    expect((await db.query<{relrowsecurity:boolean}>("select relrowsecurity from pg_class where relname='vision_opportunities'")).rows).toEqual([{relrowsecurity:true}]);
    expect((await db.query("select * from pg_policies where tablename='vision_opportunities'")).rows).toEqual([]);
    const {opportunity} = await (await create()).json();
    await expect(db.query("update vision_opportunities set latitude=20 where id=$1",[opportunity.id])).rejects.toThrow();
  });
});
