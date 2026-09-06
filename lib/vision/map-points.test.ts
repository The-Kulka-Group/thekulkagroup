import {describe,it,expect} from "vitest";
import {groupMapPoints} from "./map-points";
const point=(id:string,latitude:number|null,longitude:number|null)=>({id,name:id,address:"",latitude,longitude});
describe("map discovery grouping",()=>{
 it("keeps every located record, including separate applications at identical coordinates",()=>{
  const groups=groupMapPoints([point("a",1,1),point("b",1,1),point("c",100,100),point("missing",null,null)],(x,y)=>({x,y}));
  expect(groups.map(group=>group.map(p=>p.id))).toEqual([["a","b"],["c"]]);
 });
 it("separates nearby records as the map zoom increases",()=>{
  const points=[point("a",1,1),point("b",2,2)];
  expect(groupMapPoints(points,(x,y)=>({x,y}))).toHaveLength(1);
  expect(groupMapPoints(points,(x,y)=>({x:x*100,y:y*100}))).toHaveLength(2);
 });
});
