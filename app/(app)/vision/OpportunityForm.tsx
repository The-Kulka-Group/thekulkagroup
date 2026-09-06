"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { STATUS_LABEL } from "@/lib/data";
import type { VisionOpportunity } from "@/lib/vision/types";

type Prefill = { sourceTitle?: string; sourceUrl?: string; sourceDate?: string };
export function OpportunityForm({ opportunity, prefill = {}, hideReviewStatus = false }: { opportunity?: VisionOpportunity; prefill?: Prefill; hideReviewStatus?: boolean }) {
  const router = useRouter();
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState<string>();
  const [saved,setSaved] = useState(false);
  const [revision,setRevision] = useState(opportunity?.revision);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(undefined); setSaved(false);
    const form = new FormData(event.currentTarget);
    const number = (key: string) => form.get(key) === "" ? null : Number(form.get(key));
    const body = Object.fromEntries(["name","town","county","address","sourceTitle","sourceUrl","sourceDate","notes"].map(key => [key,form.get(key)]));
    try {
      const response = await fetch(opportunity ? `/api/vision/opportunities/${opportunity.id}` : "/api/vision/opportunities", {
        method: opportunity ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body,latitude:number("latitude"),longitude:number("longitude"), ...(opportunity ? {status:hideReviewStatus?opportunity.status:form.get("status"),expectedRevision:revision} : {}) }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) { setError(result?.error ?? "The opportunity could not be saved."); return; }
      if (!result?.opportunity?.id) { setError("The server returned an unreadable response. Reload the list to check whether the opportunity was saved."); return; }
      if (!opportunity) router.push(`/vision/${result.opportunity.id}`);
      setRevision(result.opportunity.revision); setSaved(true); router.refresh();
    } catch { setError("The opportunity could not be saved. Check the connection and try again."); }
    finally { setSaving(false); }
  }
  const defaults = { ...prefill,...opportunity };
  const fields = [
    {name:"name",label:"Opportunity name",max:200,required:true},
    {name:"town",label:"Town",max:120,required:true},
    {name:"county",label:"County",max:120,required:true},
    {name:"address",label:"Address",max:400},
    {name:"latitude",label:"Latitude",type:"number",min:-90,maxNumber:90},
    {name:"longitude",label:"Longitude",type:"number",min:-180,maxNumber:180},
    {name:"sourceTitle",label:"Source title",max:300,required:true},
    {name:"sourceUrl",label:"Source URL",type:"url",max:2048,required:true},
    {name:"sourceDate",label:"Source date",type:"date"},
  ];
  return <form className="vision-form" onSubmit={submit}>
    <section><h2 className="t-2">{opportunity ? "Opportunity details" : "Save a construction or development opportunity"}</h2>
      <p className="t-meta">Record the public source and what it says. Leave unknown addresses, coordinates and dates blank.</p>
      <div className="vision-form-grid">{fields.map(field => <label key={field.name} htmlFor={`vision-${field.name}`}>{field.label}{field.required ? " (required)" : ""}
        <input id={`vision-${field.name}`} className="input" name={field.name} type={field.type ?? "text"} required={field.required} maxLength={field.max} min={field.min} max={field.maxNumber} step={field.type === "number" ? "any" : undefined}
          defaultValue={defaults[field.name as keyof typeof defaults] ?? ""} />
      </label>)}</div>
      <p className="t-meta">Enter both coordinates to place this opportunity on the map. A source date is the publication date, if known.</p>
    </section>
    <section><h2 className="t-2">{hideReviewStatus ? "Original notes" : "Review"}</h2>{!hideReviewStatus ? <p className="t-meta">The status tracks your review work. It does not confirm that a project is approved or ready to build.</p> : null}
      {opportunity && !hideReviewStatus ? <label className="vision-status-label" htmlFor="vision-status">Review status<select className="input" id="vision-status" name="status" defaultValue={opportunity.status}>{Object.entries(STATUS_LABEL).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label> : null}
      <label htmlFor="vision-notes">Notes<textarea className="input vision-notes" id="vision-notes" name="notes" maxLength={10000} rows={6} defaultValue={opportunity?.notes ?? ""} /></label>
    </section>
    {error ? <p role="alert" className="input-error">{error}</p> : null}
    {saved ? <p role="status">Your changes were saved.</p> : null}
    <div className="vision-form-actions"><button className="btn btn--primary" type="submit" disabled={saving}>{saving ? "Saving…" : opportunity ? "Save changes" : "Save opportunity"}</button><Link className="btn btn--quiet" href="/vision">Back to opportunities</Link></div>
  </form>;
}
