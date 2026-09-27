import type {ReactNode} from "react";

export function DiscoveryFilterDisclosure({activeCount,invalid=false,children}:{activeCount:number;invalid?:boolean;children?:ReactNode}) {
  return <details className="vision-discovery-filters" open={activeCount>0||invalid}>
    <summary><span>Discovery Filters</span>{activeCount>0?<span className="vision-filter-count">{activeCount}</span>:null}</summary>
    {children}
  </details>;
}
