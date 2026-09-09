import {cookies} from "next/headers";
import {SOURCE_SELECTION_COOKIE,readSourcePreference} from "@/lib/vision/source-selection";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import { DiscoveryInbox } from "./DiscoveryInbox";
import "../vision.css";
import "./discovery.css";
export default async function DiscoverPage({searchParams}:{searchParams:Promise<{record?:string}>}) {
  const {record}=await searchParams;
  const selectedSources=readSourcePreference((await cookies()).get(SOURCE_SELECTION_COOKIE)?.value);
  return <Sheet number="V-002" title="Discover opportunities" bodyClass="vision-workspace" meta={<span>Official source records · Review before tracking</span>} actions={<><Link className="btn btn--quiet" href="/vision/sources">All sources</Link><Link className="btn btn--quiet" href="/vision">Tracked opportunities</Link></>}>
    <DiscoveryInbox initialSources={selectedSources} initialRecord={typeof record==="string" ? record : undefined} />
  </Sheet>;
}
