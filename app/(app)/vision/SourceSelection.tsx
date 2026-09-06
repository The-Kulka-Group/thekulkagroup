"use client";
import {useState,useTransition} from "react";
import {saveSourceSelection} from "./actions/source-selection";
import {useRouter} from "next/navigation";
import {DISCOVERY_SOURCES} from "@/lib/vision/discovery-catalog";
import {SOURCE_SELECTION_COOKIE,sourcePreferenceValue} from "@/lib/vision/source-selection";
import {SourceBrand} from "./SourceBrand";
import "./source-selection.css";
export function SourceSelection({selected,onChange,disabled=false}:{selected:string[];onChange:(ids:string[])=>void;disabled?:boolean}) {
  return <fieldset className="vision-source-selection" disabled={disabled}><legend>Discovery sources</legend><div>{DISCOVERY_SOURCES.map(source=><label key={source.id}><SourceBrand id={source.id} name={source.name}/><input className="vision-source-switch" type="checkbox" role="switch" checked={selected.includes(source.id)} onChange={event=>onChange(event.target.checked?[...selected,source.id]:selected.filter(id=>id!==source.id))}/></label>)}</div><p className="t-meta">This choice applies to discoveries in this browser. Tracked opportunities stay visible. Source checks run only when you request them.</p>{!selected.length?<p role="status">No discovery sources are selected. Select a source to see its records.</p>:null}</fieldset>;
}
export function useSourceSelection(initialSources:string[]) {
  const router=useRouter();
  const [selected,setSelected]=useState(initialSources),[error,setError]=useState("");
  const [pending,startTransition]=useTransition();
  function change(ids:string[]) {
    startTransition(async()=>{
      try {
        await saveSourceSelection(ids);
        const stored=document.cookie.split("; ").find(cookie=>cookie.startsWith(`${SOURCE_SELECTION_COOKIE}=`))?.slice(SOURCE_SELECTION_COOKIE.length+1);
        if(stored===undefined || decodeURIComponent(stored)!==sourcePreferenceValue(ids))throw new Error();
        setError("");setSelected(ids);router.refresh();
      } catch {setError("This browser could not save the source choice. Allow cookies and try again. The previous selection remains active.");}
    });
  }
  return {selected,change,pending,error};
}
export function SavedSourceSelection({initialSources}:{initialSources:string[]}) {
  const {selected,change,pending,error}=useSourceSelection(initialSources);
  return <><SourceSelection selected={selected} onChange={change} disabled={pending}/>{pending?<p role="status">Updating discovery sources…</p>:null}{error?<p className="input-error" role="alert">{error}</p>:null}</>;
}
