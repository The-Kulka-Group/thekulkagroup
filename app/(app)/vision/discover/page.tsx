import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import { DiscoveryInbox } from "./DiscoveryInbox";
import "../vision.css";
import "./discovery.css";
export default async function DiscoverPage({searchParams}:{searchParams:Promise<{record?:string}>}) {
  const {record}=await searchParams;
  return <Sheet number="V-002" title="Discover opportunities" meta={<span>Official source records · Review before tracking</span>} actions={<><Link className="btn btn--quiet" href="/vision/sources">All sources</Link><Link className="btn btn--quiet" href="/vision">Tracked opportunities</Link></>}>
    <DiscoveryInbox initialRecord={typeof record==="string" ? record : undefined} />
  </Sheet>;
}
