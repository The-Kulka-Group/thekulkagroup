import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import { authorizeRequest } from "@/lib/auth/server";
import { OpportunityForm } from "../OpportunityForm";
import "../vision.css";

export default async function NewOpportunityPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const auth = await authorizeRequest();
  const params = await searchParams;
  const prefill = Object.fromEntries(["sourceTitle","sourceUrl","sourceDate"].flatMap(key => typeof params[key] === "string" ? [[key,params[key]]] : []));
  return <Sheet number="V-NEW" title="New opportunity" bodyClass="vision-workspace" meta={<span>Vision</span>}>
    {auth.ok ? <OpportunityForm prefill={prefill} /> : <div className="empty"><p>Sign in with an authorized account to save Vision opportunities.</p><Link className="btn" href="/vision">Back to opportunities</Link></div>}
  </Sheet>;
}
