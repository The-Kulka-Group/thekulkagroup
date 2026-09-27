"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import Link from "next/link";
import { Check,Clock,MinusCircle } from "@phosphor-icons/react";
import {SourceSelection,useSourceSelection} from "../SourceSelection";
import type {SourceCheckResult} from "@/lib/vision/source-selection";
import type { DiscoveryCandidate,DiscoveryState } from "@/lib/vision/discovery";
import type { DiscoveredRecord } from "@/lib/vision/discovery-source";
import {SourceBrand} from "../SourceBrand";
import { DISCOVERY_SOURCES } from "@/lib/vision/discovery-catalog";
import { SourceEvidence } from "./SourceEvidence";
import { SOURCE_RUN_OUTCOME_LABELS, visionDate, visionDateTime } from "@/lib/vision/presentation";
type Detail={candidate:DiscoveryCandidate;history:{revision:number;snapshot:DiscoveredRecord;captured_at:string}[]};
async function api(path:string,body?:unknown) {const r=await fetch(`/api/vision/discovery${path}`,body===undefined?{}:{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const data=await r.json();if(!r.ok) throw new Error(data.error || "The request failed.");return data;}
const REVIEW_STATES = {new:{label:"Needs review",Glyph:Clock},accepted:{label:"Saved to Vision",Glyph:Check},dismissed:{label:"Dismissed",Glyph:MinusCircle}};
function ReviewState({state}:{state:DiscoveryCandidate["review_state"]}) {const {label,Glyph}=REVIEW_STATES[state];return <span className={`status-block discovery-state discovery-state--${state}`}><Glyph size={14} aria-hidden="true" />{label}</span>;}
function sourceCheckMessage(result:SourceCheckResult) {
  if(result.status==="running")return "Checking this source…";
  if(result.status==="success")return result.outcome==="completed_empty"?"The check completed with no records. Earlier source records remain available.":`The check returned ${result.count} records. Existing review choices stay unchanged.`;
  if(result.outcome==="skipped")return "The source check was skipped.";
  return result.error;
}
const EMPTY_FILTERS={applicationType:"",location:"",dateMode:"all",from:"",to:""};
export function DiscoveryInbox({initialRecord,initialSources}:{initialRecord?:string;initialSources:string[]}) {
  const {selected,change,pending,error:selectionError}=useSourceSelection(initialSources);
  const [checks,setChecks]=useState<Record<string,SourceCheckResult>>({});
  const [state,setState]=useState("new"),[search,setSearch]=useState(""),[page,setPage]=useState(0);
  const [filters,setFilters]=useState(EMPTY_FILTERS),[applicationTypes,setApplicationTypes]=useState<string[]>([]);
  const query=new URLSearchParams({state,sources:selected.join(","),...filters}).toString();
  const [loadedQuery,setLoadedQuery]=useState("");
  const [targetId,setTargetId]=useState("");
  const [opportunities,setOpportunities]=useState<{id:string;name:string;town:string}[]>([]);
  const [dateMode,setDateMode]=useState("all");
  const [sources,setSources]=useState<Record<string,DiscoveryState|null>>({}),[sourceErrors,setSourceErrors]=useState<Record<string,string>>({}),[items,setItems]=useState<DiscoveryCandidate[]>([]);
  const [detail,setDetail]=useState<Detail|null>(null),[notes,setNotes]=useState(""),[town,setTown]=useState("");
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;fetch("/api/vision/opportunities").then(async response=>{if(!response.ok)throw new Error("Could not load saved opportunities.");return response.json();}).then(data=>{if(active)setOpportunities(data.opportunities);}).catch(error=>{if(active)setError(error.message);});return()=>{active=false;};},[]);
  const requestNumber=useRef(0),activeFilter=useRef(query);
  const load=useCallback(()=>{
    const request=++requestNumber.current;
    return api(`?${query}`).then(data=>{
      if(request===requestNumber.current && activeFilter.current===query){setLoadedQuery(query);setSources(data.sources);setSourceErrors(data.sourceErrors);setItems(data.candidates);setApplicationTypes(data.applicationTypes);setLoading(false);}
    }).catch(cause=>{
      if(request===requestNumber.current && activeFilter.current===query){setLoadedQuery(query);setError((cause as Error).message);setItems([]);setLoading(false);}
    });
  },[query]);
  useEffect(()=>{
    activeFilter.current=query;
    void load();
    const requests=requestNumber;
    return()=>{requests.current++;};
  },[load,query]);
  useEffect(()=>{
    if(!initialRecord)return;
    let active=true;
    api(`/${encodeURIComponent(initialRecord)}`).then(data=>{if(active){setDetail(data);setTown(data.candidate.snapshot.town);setTargetId("");}}).catch(cause=>{if(active)setError((cause as Error).message);});
    return()=>{active=false;};
  },[initialRecord]);
  useEffect(()=>{if(detail?.candidate.id)document.getElementById("vision-source-record")?.scrollIntoView({block:"start"});},[detail?.candidate.id]);
  function showRun(result:{sourceId:string;outcome:keyof typeof SOURCE_RUN_OUTCOME_LABELS;count:number;error:string|null}){
    setChecks(current=>({...current,[result.sourceId]:result.outcome==="completed"||result.outcome==="completed_empty"?{status:"success",count:result.count,outcome:result.outcome}:{status:"error",error:result.error??SOURCE_RUN_OUTCOME_LABELS[result.outcome],outcome:result.outcome}}));
  }
  async function refreshAll(){
    setBusy(true);setError("");setNotice("");setChecks(Object.fromEntries(DISCOVERY_SOURCES.map(source=>[source.id,{status:"running" as const}])));
    try {const result=await api("/refresh?source=all",{});for(const run of result.results)showRun(run);setNotice("The enabled source checks finished with separate results.");await load();}
    catch(cause){setError((cause as Error).message);}
    finally {setBusy(false);}
  }
  async function refreshOne(id:string){
    setBusy(true);setError("");setNotice("");setChecks(current=>({...current,[id]:{status:"running"}}));
    try {const result=await api(`/refresh?source=${encodeURIComponent(id)}`,{});showRun({sourceId:id,outcome:result.outcome,count:result.count,error:null});await load();}
    catch(cause){setChecks(current=>({...current,[id]:{status:"error",error:(cause as Error).message}}));await load();}
    finally {setBusy(false);}
  }
  async function open(id:string){setBusy(true);setError("");try{const data=await api(`/${id}`);setDetail(data);setNotes("");setTargetId("");setTown(data.candidate.snapshot.town);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function review(action:"accept"|"dismiss"){if(!detail)return;setBusy(true);setError("");try{const result=await api(`/${detail.candidate.id}`,{action,expectedRevision:detail.candidate.revision,notes:targetId?"":notes,town,...(action==="accept" && targetId?{opportunityId:targetId}:{})});setNotice(action==="accept"?targetId?"The source record is linked to the saved opportunity.":"The opportunity is saved in Vision.":"The source record is dismissed.");const updated=await api(`/${result.id}`);setDetail(updated);setNotes("");setTown(updated.candidate.snapshot.town);await load();if(action==="accept"){const response=await fetch("/api/vision/opportunities");if(response.ok)setOpportunities((await response.json()).opportunities);}}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  function applyNarrowFilters(form:HTMLFormElement){
    const data=new FormData(form);
    setFilters(Object.fromEntries(Object.keys(EMPTY_FILTERS).map(key=>[key,String(data.get(key) ?? "")])) as typeof EMPTY_FILTERS);
    setPage(0);setDetail(null);setError("");
  }
  const filtered=items.filter(item=>`${item.snapshot.name} ${item.snapshot.town} ${item.snapshot.address} ${item.snapshot.externalId}`.toLowerCase().includes(search.toLowerCase()));
  const currentPage=Math.min(page,Math.max(0,Math.ceil(filtered.length/20)-1));
  const visible=filtered.slice(currentPage*20,currentPage*20+20);
  return <>
    <SourceSelection selected={selected} disabled={busy||pending} onChange={ids=>{change(ids);setPage(0);setError("");}}/>
    {selectionError?<p role="alert" className="input-error">{selectionError}</p>:null}
    {pending?<p role="status">Updating discovery sources…</p>:null}
    <div className="discovery-check"><p>Allow five minutes between checks of each source. A public filing does not confirm approval, funding, or an open bid.</p><button className="btn btn--primary" disabled={busy||pending} onClick={()=>void refreshAll()}>{busy?"Please wait…":"Check All Enabled Sources"}</button></div>
    <div className="discovery-source-checks">{DISCOVERY_SOURCES.filter(item=>selected.includes(item.id)).map(source=>{
      const status=sources[source.id],result=checks[source.id];
      return <section className="discovery-source-check" key={source.id}><h2><SourceBrand id={source.id} name={source.name}/></h2><p>{source.coverage}</p><div className="vision-source-health"><span className="chip chip--neutral">Daily Schedule</span><span className="chip chip--neutral">Latest Outcome: {status?.last_outcome?SOURCE_RUN_OUTCOME_LABELS[status.last_outcome]:"Not Checked"}</span><span className="chip chip--neutral">{status?.record_count??0} records</span></div><div className="vision-inline-actions"><button className="btn btn--primary" type="button" disabled={busy||pending} onClick={()=>void refreshOne(source.id)}>Check This Source</button><a className="btn btn--quiet" href={source.url} target="_blank" rel="noopener noreferrer">Open Source</a></div><p className="t-meta">Last check: {visionDateTime(status?.last_checked_at??null)} · Last completed check: {visionDateTime(status?.last_success_at??null)}</p>
        {result?<p role={result.status==="error"?"alert":"status"} className={result.status==="error"?"input-error":undefined}>{sourceCheckMessage(result)}</p>:status?.running?<p role="status">A source check is running. Reload to see its result.</p>:status?.last_error?<p className="input-error">{status.last_error}</p>:null}
        {sourceErrors[source.id]?<p role="alert" className="input-error">{sourceErrors[source.id]}</p>:null}
        {status?.coverage?<details><summary>Last completed coverage: {status.coverage.documents.length} documents from {status.coverage.year}</summary><ul>{status.coverage.documents.map(url=><li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{decodeURIComponent(url.split("/").pop()||url)}</a></li>)}</ul></details>:null}
      </section>;
    })}</div>
    {error?<p role="alert" className="input-error">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
    <div className="vision-filters discovery-filters"><label>Review Filter<select className="input" disabled={busy} value={state} onChange={e=>{setState(e.target.value);setPage(0);setDetail(null);setItems([]);setLoading(true);setError("");}}><option value="new">Needs Review</option><option value="accepted">Saved to Vision</option><option value="dismissed">Dismissed</option><option value="all">All Records</option></select></label><label>Search Source Records<input className="input" type="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="Name, town, address or source ID" /></label></div>
    <form className="discovery-narrow-filters" onSubmit={event=>{event.preventDefault();applyNarrowFilters(event.currentTarget);}}>
      <label>Application Type<select className="input" disabled={busy} name="applicationType" defaultValue="" aria-label="Application type, applies when selected" onChange={event=>applyNarrowFilters(event.currentTarget.form!)}><option value="">All Application Types</option>{[...new Set([...applicationTypes,...(filters.applicationType?[filters.applicationType]:[])])].sort().map(type=><option key={type} value={type}>{type}</option>)}</select></label>
      <label>Location<input className="input" disabled={busy} name="location" maxLength={400} defaultValue="" placeholder="Town, county or address" /></label>
      <label>Source Dates<select className="input" disabled={busy} name="dateMode" value={dateMode} aria-label="Source dates, applies when selected" onChange={event=>{setDateMode(event.target.value);applyNarrowFilters(event.currentTarget.form!);}}><option value="all">All Dates</option><option value="known">Known Dates</option><option value="unknown">Unknown Dates</option></select></label>
      <label>From Date<input className="input" type="date" disabled={busy || dateMode==="unknown"} name="from" defaultValue="" onChange={event=>applyNarrowFilters(event.currentTarget.form!)} /></label>
      <label>To Date<input className="input" type="date" disabled={busy || dateMode==="unknown"} name="to" defaultValue="" onChange={event=>applyNarrowFilters(event.currentTarget.form!)} /></label>
      <div className="discovery-filter-actions"><p>Menu and date choices apply at once. Use this button after typing a location.</p><div className="vision-form-actions"><button className="btn btn--secondary" type="submit" disabled={busy}>Apply Location</button><button type="button" className="btn btn--quiet" disabled={busy} onClick={event=>{event.currentTarget.form?.reset();setDateMode("all");setFilters(EMPTY_FILTERS);setSearch("");setState("new");setPage(0);setDetail(null);setError("");}}>Clear Filters</button></div></div>
    </form>
    <p className="t-meta">Dates use each record’s stated date label. Meeting dates and received dates describe different events. Date ranges include both endpoints and exclude unknown dates.</p>
    {detail?<section key={detail.candidate.id} id="vision-source-record" className="discovery-detail" aria-label="Source Record Review"><div className="discovery-detail-head"><h2>{detail.candidate.snapshot.name}</h2><button className="btn btn--quiet" onClick={()=>setDetail(null)}>Close Record</button></div><p className="t-meta"><SourceBrand id={detail.candidate.source_id} name={DISCOVERY_SOURCES.find(source=>source.id===detail.candidate.source_id)?.name ?? detail.candidate.snapshot.sourceTitle} compact/>{!selected.includes(detail.candidate.source_id)?" · This source is hidden from your discovery list. Your selection has not changed.":""}</p><p>{detail.candidate.snapshot.address || "The source did not provide an address."}</p><p><a className="btn btn--quiet" target="_blank" rel="noopener noreferrer" href={detail.candidate.snapshot.sourceUrl}>Open Official Record</a></p><p>{detail.candidate.snapshot.sourceDateLabel}: {detail.candidate.snapshot.sourceDate?visionDate(detail.candidate.snapshot.sourceDate):"Not Provided"}</p><p className="t-meta">First found: {visionDateTime(detail.candidate.first_seen_at)} · Last found: {visionDateTime(detail.candidate.last_seen_at)} · Revision {detail.candidate.revision}</p><dl>{Object.entries(detail.candidate.snapshot.details).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value || "Not Provided"}</dd></div>)}</dl>
      <SourceEvidence record={detail.candidate.snapshot}/>{detail.candidate.snapshot.identityStatus==="unresolved" || detail.candidate.snapshot.classification==="policy"?<p role="status">This record contains policy context or needs identity review. Link it to a known opportunity when relevant, or leave it in review.</p>:null}
      {detail.candidate.review_state==="new"?<form className="vision-form" onSubmit={e=>{e.preventDefault();void review("accept");}}><label>Save to<select className="input" value={targetId} disabled={busy} onChange={event=>setTargetId(event.target.value)}><option value="">Create a New Opportunity</option>{opportunities.map(item=><option key={item.id} value={item.id}>{item.name} · {item.town}</option>)}</select></label>{!targetId?<><label>Town<input className="input" required maxLength={120} value={town} onChange={e=>setTown(e.target.value)} /></label><p className="t-meta">Confirm the town from the source before saving.</p><label>Review Notes<textarea className="input vision-notes" maxLength={8000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Why this may be relevant and what needs a check" /></label></>:<p>The filing will appear with this opportunity’s source evidence. Its notes and workflow will stay as entered.</p>}<div className="vision-form-actions"><button className="btn btn--primary" disabled={busy || (!targetId && (detail.candidate.snapshot.identityStatus==="unresolved" || detail.candidate.snapshot.classification==="policy"))}>{targetId?"Link Source Record":"Save Opportunity"}</button><button type="button" className="btn btn--quiet" disabled={busy} onClick={()=>review("dismiss")}>Dismiss Record</button></div></form>:<p>{detail.candidate.opportunity_id?<Link className="btn btn--primary" href={`/vision/${detail.candidate.opportunity_id}`}>Open Saved Opportunity</Link>:"You dismissed this record. Source checks will keep it dismissed."}</p>}
      <details><summary>Source Capture History ({detail.history.length})</summary>{detail.history.map(entry=><article key={entry.revision}><h3>Revision {entry.revision} · {visionDateTime(entry.captured_at)}</h3><p>{entry.snapshot.name} · {entry.snapshot.address}</p><p>{entry.snapshot.town || "Town Not Provided"} · {entry.snapshot.county}</p><p>Coordinates: {entry.snapshot.latitude ?? "Not Provided"}, {entry.snapshot.longitude ?? "Not Provided"}</p><p>{entry.snapshot.sourceTitle} · {entry.snapshot.externalId}</p><p>{entry.snapshot.sourceDateLabel}: {entry.snapshot.sourceDate || "Not Provided"}</p><dl>{Object.entries(entry.snapshot.details).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl><SourceEvidence record={entry.snapshot}/><p><a className="btn btn--quiet" href={entry.snapshot.sourceUrl} target="_blank" rel="noopener noreferrer">Open Captured Source Link</a></p></article>)}</details></section>:null}
    <p className="t-meta">{filtered.length} records match this view. The inbox shows up to 500 records per selected source after application, location and date filters. Records sort by source date, then last change.</p>
    {loading||loadedQuery!==query?<p role="status">Loading source records…</p>:visible.length?<div className="discovery-list">{visible.map(item=><article key={item.id}><div><button className="discovery-record-link" onClick={()=>open(item.id)} disabled={busy}>{item.snapshot.name}</button><p>{item.snapshot.address || "The source did not provide an address."}</p><p className="t-meta"><SourceBrand id={item.source_id} name={DISCOVERY_SOURCES.find(source=>source.id===item.source_id)?.name ?? item.snapshot.sourceTitle} compact/> · {item.snapshot.town || "Town Needs Review"} · {item.snapshot.county}</p><p className="t-meta">{item.snapshot.sourceDateLabel}: {item.snapshot.sourceDate?visionDate(item.snapshot.sourceDate):"Not Provided"}</p></div><ReviewState state={item.review_state} /></article>)}</div>:<p>{!selected.length?"Select a discovery source above to see records.":"No source records match this view. Change the filters or check the selected sources."}</p>}
    <div className="vision-form-actions discovery-pagination"><button className="btn" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous</button><span className="chip chip--neutral">Page {currentPage+1}</span><button className="btn" disabled={(currentPage+1)*20>=filtered.length} onClick={()=>setPage(currentPage+1)}>Next</button></div>
  </>;
}
