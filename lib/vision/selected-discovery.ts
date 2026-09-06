import type {Db} from "@/lib/db";
import {discoveryInbox,type DiscoveryCandidate,type DiscoveryState} from "./discovery";
import type {DiscoveryFilters} from "./discovery-filters";
import {InvalidVisionInput} from "./input";
import {parseSelectedSources} from "./source-selection";
export type SelectedDiscovery = {sources:Record<string,DiscoveryState|null>;sourceErrors:Record<string,string>;candidates:DiscoveryCandidate[];applicationTypes:string[]};
export function sortDiscoveryCandidates(candidates:DiscoveryCandidate[]) {
  return [...candidates].sort((a,b)=>(b.snapshot.sourceDate??"").localeCompare(a.snapshot.sourceDate??"") || new Date(b.changed_at).getTime()-new Date(a.changed_at).getTime() || a.id.localeCompare(b.id));
}
export async function selectedDiscoveryInbox(db:Db,ids:string[],state:string,filters:DiscoveryFilters):Promise<SelectedDiscovery> {
  const selected=parseSelectedSources(ids.join(","));
  if(!["new","dismissed","accepted","all"].includes(state))throw new InvalidVisionInput("Choose a valid review filter.");
  const results=await Promise.allSettled(selected.map(id=>discoveryInbox(db,state,filters,id)));
  const output:SelectedDiscovery={sources:{},sourceErrors:{},candidates:[],applicationTypes:[]};
  results.forEach((result,index)=>{
    const id=selected[index];
    if(result.status==="fulfilled"){
      output.sources[id]=result.value.source;output.candidates.push(...result.value.candidates);output.applicationTypes.push(...result.value.applicationTypes);
    }else {output.sourceErrors[id]="The source records could not load. Try again.";}
  });
  output.candidates=sortDiscoveryCandidates(output.candidates);
  output.applicationTypes=[...new Set(output.applicationTypes)].sort();
  return output;
}
