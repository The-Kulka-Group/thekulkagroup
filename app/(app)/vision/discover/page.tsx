import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import { DISCOVERY_SOURCE } from "@/lib/vision/discovery-source";
import { DiscoveryInbox } from "./DiscoveryInbox";
import "../vision.css";
import "./discovery.css";
export default function DiscoverPage() {
  return <Sheet number="V-002" title="Discover opportunities" meta={<span>Official source records · Review before tracking</span>} actions={<><Link className="btn btn--quiet" href="/vision/sources">All sources</Link><Link className="btn btn--quiet" href="/vision">Tracked opportunities</Link></>}>
    <section className="discovery-coverage"><h2>{DISCOVERY_SOURCE.name}</h2><p>{DISCOVERY_SOURCE.coverage}</p><p>A public application does not confirm approval, funding, or an open bid. Review its source before saving it.</p><a href={DISCOVERY_SOURCE.url} target="_blank" rel="noopener noreferrer">Open the county planning page</a></section>
    <DiscoveryInbox />
  </Sheet>;
}
