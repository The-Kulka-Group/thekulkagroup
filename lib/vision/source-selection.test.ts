import {describe,expect,it} from "vitest";
import {checkSelectedSources,DEFAULT_SOURCE_IDS,parseSelectedSources,readSourcePreference,sourcePreferenceValue,type SourceCheckResult} from "./source-selection";
describe("source preference",()=>{
  it("defaults all catalog sources on and preserves the intentional empty selection",()=>{
    expect(readSourcePreference(undefined)).toEqual(DEFAULT_SOURCE_IDS);
    expect(readSourcePreference("broken")).toEqual(DEFAULT_SOURCE_IDS);
    expect(readSourcePreference(sourcePreferenceValue([]))).toEqual([]);
    expect(readSourcePreference(sourcePreferenceValue(["suffolk-planning"]))).toEqual(["suffolk-planning"]);
  });
  it("does not add sources to an existing browser choice",()=>{
    expect(readSourcePreference("v1:nassau-applications,suffolk-planning")).toEqual(["nassau-applications","suffolk-planning"]);
    expect(readSourcePreference(undefined)).toEqual(["nassau-applications","suffolk-planning","nassau-ida","suffolk-ida","nassau-town-oyster-bay-records"]);
    expect(readSourcePreference(sourcePreferenceValue(["nassau-ida","suffolk-ida"]))).toEqual(["nassau-ida","suffolk-ida"]);
  });
  it("allows only catalog IDs, deduplicates and keeps catalog order",()=>{
    expect(readSourcePreference("v1:unknown")).toEqual(DEFAULT_SOURCE_IDS);
    expect(readSourcePreference("v1:unknown,suffolk-planning")).toEqual(["suffolk-planning"]);
    expect(parseSelectedSources("suffolk-planning,nassau-applications,suffolk-planning")).toEqual(["nassau-applications", "suffolk-planning"]);
    expect(()=>parseSelectedSources("unknown")).toThrow();
  });
});
describe("selected source checks",()=>{
  it("reports each source independently when one collection fails",async()=>{
    const events:Record<string,SourceCheckResult[]>={};
    await checkSelectedSources(DEFAULT_SOURCE_IDS,async id=>{if(id==="suffolk-planning")throw new Error("Wait five minutes.");return {count:3};},(id,result)=>(events[id]??=[]).push(result));
    expect(events["nassau-applications"]).toEqual([{status:"running"},{status:"success",count:3}]);
    expect(events["suffolk-planning"]).toEqual([{status:"running"},{status:"error",error:"Wait five minutes."}]);
  });
  it("does not collect when none are selected",async()=>{
    let calls=0;await checkSelectedSources([],async()=>{calls++;return {count:1};},()=>calls++);expect(calls).toBe(0);
  });
});
