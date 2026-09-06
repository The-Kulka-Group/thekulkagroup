"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import type {VisionOpportunity} from "@/lib/vision/types";
import type {LocationMatch} from "@/lib/vision/location-lookup";
import {LocationMap} from "./LocationMap";
import "./location.css";
type SourceAddress={address:string;url:string;title:string};
export function OpportunityLocation({opportunity,sources}:{opportunity:VisionOpportunity;sources:SourceAddress[]}) {
  const router=useRouter();
  const [saved,setSaved]=useState(opportunity);
  const [address,setAddress]=useState(opportunity.address);
  const [latitude,setLatitude]=useState(opportunity.latitude===null?"":String(opportunity.latitude));
  const [longitude,setLongitude]=useState(opportunity.longitude===null?"":String(opportunity.longitude));
  const [matches,setMatches]=useState<LocationMatch[]>([]);
  const [message,setMessage]=useState(""); const [error,setError]=useState("");
  const [busy,setBusy]=useState<"lookup"|"save"|null>(null);
  const [editing,setEditing]=useState(opportunity.latitude===null||opportunity.longitude===null);
  const [conflict,setConflict]=useState(false);
  const sequence=useRef(0);
  const coordinate=(value:string,limit:number)=>value.trim()!==""&&Number.isFinite(Number(value))&&Math.abs(Number(value))<=limit?Number(value):null;
  const lat=coordinate(latitude,90),lng=coordinate(longitude,180);
  function changeAddress(value:string){sequence.current++;setAddress(value);setLatitude("");setLongitude("");setMatches([]);setMessage("");setError("");}
  function place(lat:number,lng:number){sequence.current++;setLatitude(String(lat));setLongitude(String(lng));setMessage("The proposed pin has not been saved.");setError("");}
  async function lookup(){
    const requestSequence=++sequence.current;
    setBusy("lookup");setError("");setMatches([]);setMessage("");
    try {
      const response=await fetch("/api/vision/location-lookup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({address})});
      const body=await response.json(); if(requestSequence!==sequence.current)return;
      if(!response.ok)throw new Error(body.error||"The address lookup failed. Try again.");
      setMatches(body.matches);setMessage(body.matches.length?"Select a suggested address to preview its pin. Your saved location has not changed.":"No address matches were found. Add a street number, town and state, or place the pin yourself.");
    }catch(error){if(requestSequence===sequence.current)setError(error instanceof Error?error.message:"The lookup failed. Try again.");}
    finally{setBusy(null);}
  }
  async function save(clear=false){
    if(!clear&&((lat===null)!==(lng===null)||latitude.trim()!==""&&lat===null||longitude.trim()!==""&&lng===null)){setError("Enter valid latitude and longitude together, or leave both blank.");return;}
    sequence.current++;setBusy("save");setError("");setMessage("");
    try {
      const response=await fetch(`/api/vision/opportunities/${opportunity.id}/location`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({address,latitude:clear?null:lat,longitude:clear?null:lng,expectedRevision:saved.revision})});
      const body=await response.json();
      if(!response.ok){if(response.status===409)setConflict(true);throw new Error(body.error||"The location could not be saved.");}
      setSaved(body.opportunity);setLatitude(body.opportunity.latitude===null?"":String(body.opportunity.latitude));setLongitude(body.opportunity.longitude===null?"":String(body.opportunity.longitude));setMatches([]);setEditing(false);setMessage(clear?"The pin was cleared. The opportunity remains in the list.":"The location was saved.");router.refresh();
    }catch(error){setError(error instanceof Error?error.message:"The location could not be saved. Check your connection and try again.");}
    finally{setBusy(null);}
  }
  return <section className="opportunity-location" id="location" aria-labelledby="location-heading">
    <div className="location-heading"><div><h2 id="location-heading">Map location</h2><p>{saved.latitude===null?"This opportunity is off the map because it has no pin.":"This opportunity has a saved map pin."}</p><p className="t-meta">{saved.address||"The street address is unknown."}</p></div>{!editing?<button type="button" className="btn btn--quiet" onClick={()=>setEditing(true)}>Edit location</button>:null}</div>
    {editing?<div className="location-editor">
      {sources.length?<details><summary>Addresses in linked sources ({sources.length})</summary>{sources.map((source,index)=><div className="location-source" key={index}><p>{source.address}</p><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a><button className="btn btn--quiet" disabled={busy!==null} onClick={()=>changeAddress(source.address)} type="button">Use this address</button></div>)}</details>:null}
      <label htmlFor="location-address">Street address with town and state<input id="location-address" className="input" value={address} maxLength={400} disabled={busy==="save"} onChange={event=>changeAddress(event.target.value)}/></label>
      <button className="btn" type="button" disabled={busy!==null||!address.trim()} onClick={()=>void lookup()}>{busy==="lookup"?"Looking up address…":"Find address"}</button>
      <p className="t-meta">Census address matches are approximate and do not verify a parcel. Select a match, click the map or drag the pin, then confirm its location.</p>
      {matches.length?<ul className="location-matches">{matches.map((match,index)=><li key={index}><button type="button" className="btn btn--quiet" disabled={busy!==null} onClick={()=>{setAddress(match.address);place(match.latitude,match.longitude);}}>{match.address}</button></li>)}</ul>:null}
      <LocationMap latitude={lat!==null&&lng!==null?lat:null} longitude={lat!==null&&lng!==null?lng:null} onChange={(lat,lng)=>{if(busy!=="save")place(lat,lng);}}/>
      <div className="vision-form-grid">{[["Latitude",latitude,setLatitude],["Longitude",longitude,setLongitude]] .map(([label,value,setValue])=><label key={String(label)}>{String(label)}<input className="input" type="number" step="any" min={label==="Latitude"?-90:-180} max={label==="Latitude"?90:180} value={value as string} disabled={busy==="save"} onChange={event=>{sequence.current++;(setValue as (v:string)=>void)(event.target.value);setMessage("The proposed pin has not been saved.");}}/></label>)}</div>
      <div className="vision-form-actions"><button className="btn btn--primary" type="button" disabled={busy!==null||conflict} onClick={()=>void save()}>{busy==="save"?"Saving…":lat!==null&&lng!==null?"Confirm location":"Save address without a pin"}</button>{saved.latitude!==null?<button className="btn btn--quiet" type="button" disabled={busy!==null||conflict} onClick={()=>void save(true)}>Clear saved pin</button>:null}<button className="btn btn--quiet" type="button" disabled={busy!==null} onClick={()=>{setAddress(saved.address);setLatitude(saved.latitude===null?"":String(saved.latitude));setLongitude(saved.longitude===null?"":String(saved.longitude));setMatches([]);setEditing(false);setMessage("");setError("");}}>Cancel</button></div>
    </div>:null}
    {!editing&&saved.latitude!==null&&saved.longitude!==null?<LocationMap latitude={saved.latitude} longitude={saved.longitude} editable={false} onChange={()=>{}}/>:null}
    {error?<p className="input-error" role="alert">{error}</p>:null}{conflict?<button className="btn" type="button" onClick={()=>window.location.reload()}>Reload latest record</button>:null}{message?<p role="status">{message}</p>:null}
  </section>;
}
