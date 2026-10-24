"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { STATUS_LABEL } from "@/lib/data";
import type { VisionOpportunity } from "@/lib/vision/types";
import { useCanEdit } from "@/components/access/ToolLevel";

type Prefill = { sourceTitle?: string; sourceUrl?: string; sourceDate?: string };
export function OpportunityForm({ opportunity, prefill = {}, hideReviewStatus = false }: { opportunity?: VisionOpportunity; prefill?: Prefill; hideReviewStatus?: boolean }) {
  const router = useRouter();
  const canEdit = useCanEdit();
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState<string>();
  const [conflict,setConflict] = useState(false);
  const [saved,setSaved] = useState(false);
  const [record,setRecord] = useState(opportunity);
  const [dirty,setDirty] = useState(false);
  // New server data can refresh a pristine form. A dirty draft keeps its original
  // fields and revision so a later write cannot overwrite a newer location.
  if (!dirty && !saving && opportunity && (!record || opportunity.revision > record.revision)) {
    setRecord(opportunity);
  }
  const revision = record?.revision;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(undefined); setSaved(false);
    const form = new FormData(event.currentTarget);
    const number = (key: string) => form.get(key) === "" ? null : Number(form.get(key));
    const body = Object.fromEntries(["name","town","county","address","sourceTitle","sourceUrl","sourceDate","notes"].map(key => [key,form.get(key)]));
    try {
      const response = await fetch(opportunity ? `/api/vision/opportunities/${opportunity.id}` : "/api/vision/opportunities", {
        method: opportunity ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body,latitude:number("latitude"),longitude:number("longitude"), ...(opportunity ? {status:hideReviewStatus?record?.status:form.get("status"),expectedRevision:revision} : {}) }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) { if(response.status===409)setConflict(true); setError(result?.error ?? "The opportunity could not be saved."); return; }
      if (!result?.opportunity?.id) { setError("The server returned an unreadable response. Reload the list to check whether the opportunity was saved."); return; }
      if (!opportunity) router.push(`/vision/${result.opportunity.id}`);
      setRecord(result.opportunity); setDirty(false); setSaved(true); router.refresh();
    } catch { setError("The opportunity could not be saved. Check the connection and try again."); }
    finally { setSaving(false); }
  }
  const defaults = { ...prefill,...record };
  const fields = [
    {name:"name",label:"Opportunity Name",max:200,required:true},
    {name:"town",label:"Town",max:120,required:true},
    {name:"county",label:"County",max:120,required:true},
    {name:"address",label:"Address",max:400},
    {name:"latitude",label:"Latitude",type:"number",min:-90,maxNumber:90},
    {name:"longitude",label:"Longitude",type:"number",min:-180,maxNumber:180},
    {name:"sourceTitle",label:"Source Title",max:300,required:true},
    {name:"sourceUrl",label:"Source URL",type:"url",max:2048,required:true},
    {name:"sourceDate",label:"Source Date",type:"date"},
  ];
  return <form key={record?.revision ?? "new"} className="vision-form" onSubmit={submit} onChange={()=>{setDirty(true);setSaved(false);}}>
    <section><h2 className="t-2">{opportunity ? "Opportunity Details" : "Save a Construction or Development Opportunity"}</h2>
      <p className="t-meta">Record the public source and what it says. Leave unknown addresses, coordinates and dates blank.</p>
      <div className="vision-form-grid">{fields.map(field => <label key={field.name} htmlFor={`vision-${field.name}`}>{field.label}{field.required ? " (required)" : ""}
        <input id={`vision-${field.name}`} className="input" name={field.name} type={field.type ?? "text"} disabled={saving||!canEdit} required={field.required} maxLength={field.max} min={field.min} max={field.maxNumber} step={field.type === "number" ? "any" : undefined}
          defaultValue={defaults[field.name as keyof typeof defaults] ?? ""} />
      </label>)}</div>
      <p className="t-meta">Enter both coordinates to place this opportunity on the map. A source date is the publication date, if known.</p>
    </section>
    <section><h2 className="t-2">{hideReviewStatus ? "Original Notes" : "Review"}</h2>{!hideReviewStatus ? <p className="t-meta">The status tracks your review work. It does not confirm that a project is approved or ready to build.</p> : null}
      {opportunity && !hideReviewStatus ? <label className="vision-status-label" htmlFor="vision-status">Review Status<select className="input" id="vision-status" name="status" disabled={saving||!canEdit} defaultValue={record?.status}>{Object.entries(STATUS_LABEL).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label> : null}
      <label htmlFor="vision-notes">Notes<textarea className="input vision-notes" id="vision-notes" name="notes" maxLength={10000} rows={6} disabled={saving||!canEdit} defaultValue={record?.notes ?? ""} /></label>
    </section>
    {error ? <p role="alert" className="input-error">{error}</p> : null}
    {conflict ? <button className="btn" type="button" onClick={()=>window.location.reload()}>Reload Latest Record</button> : null}
    {saved ? <p role="status">Your changes were saved.</p> : null}
    <div className="vision-form-actions">{canEdit ? <button className="btn btn--primary" type="submit" disabled={saving||conflict}>{saving ? "Saving…" : opportunity ? "Save Changes" : "Save Opportunity"}</button> : null}<Link className="btn btn--quiet" href="/vision">Back to Opportunities</Link></div>
  </form>;
}
