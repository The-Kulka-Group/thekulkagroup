"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import Link from "next/link";
import { Check,Clock,MinusCircle } from "@phosphor-icons/react";
import type { DiscoveryCandidate,DiscoveryState } from "@/lib/vision/discovery";
import type { DiscoveredRecord } from "@/lib/vision/discovery-source";
import { visionDate } from "@/lib/vision/presentation";
type Detail={candidate:DiscoveryCandidate;history:{revision:number;snapshot:DiscoveredRecord;captured_at:string}[]};
async function api(path:string,body?:unknown) {const r=await fetch(`/api/vision/discovery${path}`,body===undefined?{}:{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const data=await r.json();if(!r.ok) throw new Error(data.error || "The request failed.");return data;}
function when(value:string|null) {return value?new Date(value).toLocaleString():"Not checked yet";}
const REVIEW_STATES = {new:{label:"Needs review",Glyph:Clock},accepted:{label:"Saved to Vision",Glyph:Check},dismissed:{label:"Dismissed",Glyph:MinusCircle}};
function ReviewState({state}:{state:DiscoveryCandidate["review_state"]}) {const {label,Glyph}=REVIEW_STATES[state];return <span className={`status-block discovery-state discovery-state--${state}`}><Glyph size={14} aria-hidden="true" />{label}</span>;}
const EMPTY_FILTERS={applicationType:"",location:"",dateMode:"all",from:"",to:""};
export function DiscoveryInbox() {
  const [state,setState]=useState("new"),[search,setSearch]=useState(""),[page,setPage]=useState(0);
  const [filters,setFilters]=useState(EMPTY_FILTERS),[applicationTypes,setApplicationTypes]=useState<string[]>([]);
  const query=new URLSearchParams({state,...filters}).toString();
  const [dateMode,setDateMode]=useState("all");
  const [source,setSource]=useState<DiscoveryState|null>(null),[items,setItems]=useState<DiscoveryCandidate[]>([]);
  const [detail,setDetail]=useState<Detail|null>(null),[notes,setNotes]=useState(""),[town,setTown]=useState("");
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const requestNumber=useRef(0),activeFilter=useRef(query);
  const load=useCallback(()=>{
    const request=++requestNumber.current;
    return api(`?${query}`).then(data=>{
      if(request===requestNumber.current && activeFilter.current===query){setSource(data.source);setItems(data.candidates);setApplicationTypes(data.applicationTypes);setLoading(false);}
    }).catch(cause=>{
      if(request===requestNumber.current && activeFilter.current===query){setError((cause as Error).message);setItems([]);setLoading(false);}
    });
  },[query]);
  useEffect(()=>{
    activeFilter.current=query;
    void load();
    const requests=requestNumber;
    return()=>{requests.current++;};
  },[load,query]);
  async function refresh(){setBusy(true);setError("");setNotice("");try{const result=await api("/refresh",{});await load();setNotice(`The source check returned ${result.count} records. Repeated records stay in their current review state.`);}catch(e){setError((e as Error).message);await load().catch(()=>{});}finally{setBusy(false);}}
  async function open(id:string){setBusy(true);setError("");try{const data=await api(`/${id}`);setDetail(data);setNotes("");setTown(data.candidate.snapshot.town);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function review(action:"accept"|"dismiss"){if(!detail)return;setBusy(true);setError("");try{const result=await api(`/${detail.candidate.id}`,{action,expectedRevision:detail.candidate.revision,notes,town});setNotice(action==="accept"?"The opportunity is saved in Vision.":"The source record is dismissed.");const updated=await api(`/${result.id}`);setDetail(updated);setNotes("");setTown(updated.candidate.snapshot.town);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const filtered=items.filter(item=>`${item.snapshot.name} ${item.snapshot.town} ${item.snapshot.address} ${item.snapshot.externalId}`.toLowerCase().includes(search.toLowerCase()));
  const currentPage=Math.min(page,Math.max(0,Math.ceil(filtered.length/20)-1));
  const visible=filtered.slice(currentPage*20,currentPage*20+20);
  return <>
    <div className="discovery-check"><div><p>Last check: {when(source?.last_checked_at ?? null)}</p><p>Last completed check: {when(source?.last_success_at ?? null)}</p><p>Allow five minutes between source checks.</p>{source?.running?<p role="status">A source check is running. Reload to see its result.</p>:null}{source?.last_error?<p className="input-error">{source.last_error}</p>:null}</div><button className="btn btn--primary" disabled={busy || source?.running} onClick={refresh}>{busy?"Please wait…":"Check source"}</button></div>
    {error?<p role="alert" className="input-error">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
    <div className="vision-filters discovery-filters"><label>Review filter<select className="input" disabled={busy} value={state} onChange={e=>{setState(e.target.value);setPage(0);setDetail(null);setItems([]);setLoading(true);setError("");}}><option value="new">Needs review</option><option value="accepted">Saved to Vision</option><option value="dismissed">Dismissed</option><option value="all">All records</option></select></label><label>Search source records<input className="input" type="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="Name, town, address or source ID" /></label></div>
    <form className="discovery-narrow-filters" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);setFilters(Object.fromEntries(Object.keys(EMPTY_FILTERS).map(key=>[key,String(data.get(key) ?? "")])) as typeof EMPTY_FILTERS);setPage(0);setDetail(null);setError("");}}>
      <label>Application type<select className="input" disabled={busy} name="applicationType" defaultValue=""><option value="">All application types</option>{applicationTypes.map(type=><option key={type} value={type}>{type}</option>)}</select></label>
      <label>Location<input className="input" disabled={busy} name="location" maxLength={400} defaultValue="" placeholder="Town, county or address" /></label>
      <label>Source dates<select className="input" disabled={busy} name="dateMode" value={dateMode} onChange={e=>setDateMode(e.target.value)}><option value="all">All dates</option><option value="known">Known dates</option><option value="unknown">Unknown dates</option></select></label>
      <label>From date<input className="input" type="date" disabled={busy || dateMode==="unknown"} name="from" defaultValue="" /></label>
      <label>To date<input className="input" type="date" disabled={busy || dateMode==="unknown"} name="to" defaultValue="" /></label>
      <div className="vision-form-actions"><button className="btn btn--primary" type="submit" disabled={busy}>Apply filters</button><button type="button" className="btn btn--quiet" disabled={busy} onClick={event=>{event.currentTarget.form?.reset();setDateMode("all");setFilters(EMPTY_FILTERS);setSearch("");setState("new");setPage(0);setDetail(null);setError("");}}>Clear filters</button></div>
    </form>
    <p className="t-meta">Dates refer to the source’s referral or filing date. Date ranges include both endpoints and exclude unknown dates.</p>
    {detail?<section className="discovery-detail" aria-label="Source record review"><div className="discovery-detail-head"><h2>{detail.candidate.snapshot.name}</h2><button className="btn btn--quiet" onClick={()=>setDetail(null)}>Close record</button></div><p>{detail.candidate.snapshot.address || "The source did not provide an address."}</p><p><a target="_blank" rel="noopener noreferrer" href={detail.candidate.snapshot.sourceUrl}>Open official record</a></p><p>{detail.candidate.snapshot.sourceDateLabel}: {detail.candidate.snapshot.sourceDate?visionDate(detail.candidate.snapshot.sourceDate):"Not provided"}</p><p className="t-meta">First found: {when(detail.candidate.first_seen_at)} · Last found: {when(detail.candidate.last_seen_at)} · Revision {detail.candidate.revision}</p><dl>{Object.entries(detail.candidate.snapshot.details).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value || "Not provided"}</dd></div>)}</dl>
      {detail.candidate.review_state==="new"?<form className="vision-form" onSubmit={e=>{e.preventDefault();void review("accept");}}><label>Town<input className="input" required maxLength={120} value={town} onChange={e=>setTown(e.target.value)} /></label><p className="t-meta">Confirm the town from the source before saving.</p><label>Review notes<textarea className="input vision-notes" maxLength={8000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Why this may be relevant and what needs a check" /></label><div className="vision-form-actions"><button className="btn btn--primary" disabled={busy}>Save opportunity</button><button type="button" className="btn btn--quiet" disabled={busy} onClick={()=>review("dismiss")}>Dismiss record</button></div></form>:<p>{detail.candidate.opportunity_id?<Link className="btn btn--primary" href={`/vision/${detail.candidate.opportunity_id}`}>Open saved opportunity</Link>:"You dismissed this record. Source checks will keep it dismissed."}</p>}
      <details><summary>Source capture history ({detail.history.length})</summary>{detail.history.map(entry=><article key={entry.revision}><h3>Revision {entry.revision} · {when(entry.captured_at)}</h3><p>{entry.snapshot.name} · {entry.snapshot.address}</p><p>{entry.snapshot.town || "Town not provided"} · {entry.snapshot.county}</p><p>Coordinates: {entry.snapshot.latitude ?? "Not provided"}, {entry.snapshot.longitude ?? "Not provided"}</p><p>{entry.snapshot.sourceTitle} · {entry.snapshot.externalId}</p><p>{entry.snapshot.sourceDateLabel}: {entry.snapshot.sourceDate || "Not provided"}</p><dl>{Object.entries(entry.snapshot.details).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl><p><a href={entry.snapshot.sourceUrl} target="_blank" rel="noopener noreferrer">Open captured source link</a></p></article>)}</details></section>:null}
    <p className="t-meta">{filtered.length} records match this view. The inbox shows up to 500 records after application, location and date filters.</p>
    {loading?<p role="status">Loading source records…</p>:visible.length?<div className="discovery-list">{visible.map(item=><article key={item.id}><div><button className="discovery-record-link" onClick={()=>open(item.id)} disabled={busy}>{item.snapshot.name}</button><p>{item.snapshot.address || "The source did not provide an address."}</p><p className="t-meta">{item.snapshot.town || "Town needs review"} · {item.snapshot.county}</p><p className="t-meta">{item.snapshot.sourceDateLabel}: {item.snapshot.sourceDate?visionDate(item.snapshot.sourceDate):"Not provided"}</p></div><ReviewState state={item.review_state} /></article>)}</div>:<p>{source?.last_success_at?"No source records match this view.":"Check the source to collect records for review."}</p>}
    <div className="vision-form-actions"><button className="btn" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous</button><span>Page {currentPage+1}</span><button className="btn" disabled={(currentPage+1)*20>=filtered.length} onClick={()=>setPage(currentPage+1)}>Next</button></div>
  </>;
}
