"use client";
import {useEffect,useRef,useState,useTransition} from "react";
import {saveSourceSelection} from "./actions/source-selection";
import {useRouter} from "next/navigation";
import {DISCOVERY_SOURCES} from "@/lib/vision/discovery-catalog";
import {SOURCE_SELECTION_COOKIE,sourcePreferenceValue} from "@/lib/vision/source-selection";
import {SourceBrand} from "./SourceBrand";
import "./source-selection.css";
type SourceSelectionProps={selected:string[];onChange:(ids:string[])=>void;disabled?:boolean;pendingMessage?:string;error?:string};

function SourceSelectionMessages({pendingMessage,error}:{pendingMessage?:string;error?:string}) {
  return <>{pendingMessage?<p>{pendingMessage}</p>:null}{error?<p className="input-error">{error}</p>:null}</>;
}

function SourceSelectionFeedback({pendingMessage,error,panelOpen}:{pendingMessage?:string;error?:string;panelOpen:boolean}) {
  return <div id="vision-source-picker-feedback" className="vision-source-feedback" data-panel-open={panelOpen} role={error?"alert":"status"} aria-live={error?"assertive":"polite"} aria-atomic="true"><SourceSelectionMessages pendingMessage={pendingMessage} error={error}/></div>;
}

export function SourceSelectionPanel({selected,onChange,disabled=false,onDone,pendingMessage,error}:{selected:string[];onChange:(ids:string[])=>void;disabled?:boolean;onDone:()=>void;pendingMessage?:string;error?:string}) {
  return <section className="vision-source-selection" id="vision-source-picker-panel" role="group" aria-labelledby="vision-source-picker-title">
    <div className="vision-source-picker-heading"><h2 id="vision-source-picker-title">Discovery sources</h2><button className="btn btn--quiet vision-source-done" type="button" onClick={onDone}>Done</button></div>
    {pendingMessage||error?<div className="vision-source-feedback" aria-hidden="true"><SourceSelectionMessages pendingMessage={pendingMessage} error={error}/></div>:null}
    <div className="vision-source-options">{DISCOVERY_SOURCES.map(source=><label className="vision-source-option" key={source.id}><SourceBrand id={source.id} name={source.name} compact/><input className="vision-source-switch" type="checkbox" role="switch" disabled={disabled} checked={selected.includes(source.id)} onChange={event=>onChange(event.target.checked?[...selected,source.id]:selected.filter(id=>id!==source.id))}/></label>)}</div>
    <p className="t-meta">This choice applies to discoveries in this browser. Tracked opportunities stay visible.</p>
    {!selected.length?<p role="status">No discovery sources are selected. Select a source to see its records.</p>:null}
  </section>;
}

export function SourceSelection({selected,onChange,disabled=false,pendingMessage,error}:SourceSelectionProps) {
  const [open,setOpen]=useState(false);
  const pickerRef=useRef<HTMLDivElement>(null);
  const triggerRef=useRef<HTMLButtonElement>(null);

  function closeAndReturnFocus(){setOpen(false);triggerRef.current?.focus();}

  useEffect(()=>{
    if(!open)return;
    function onPointerDown(event:PointerEvent){if(!pickerRef.current?.contains(event.target as Node))setOpen(false);}
    function onKeyDown(event:KeyboardEvent){if(event.key==="Escape"){event.preventDefault();setOpen(false);triggerRef.current?.focus();}}
    document.addEventListener("pointerdown",onPointerDown);
    document.addEventListener("keydown",onKeyDown);
    return ()=>{document.removeEventListener("pointerdown",onPointerDown);document.removeEventListener("keydown",onKeyDown);};
  },[open]);

  return <div className="vision-source-picker" ref={pickerRef}>
    <div className="vision-source-picker-bar">
      <button ref={triggerRef} className="btn btn--quiet vision-source-trigger" type="button" aria-expanded={open} aria-controls="vision-source-picker-panel" onClick={()=>setOpen(value=>!value)}>
        <span>Sources</span><span className="vision-source-count">{selected.length} of {DISCOVERY_SOURCES.length}</span>
      </button>
      <SourceSelectionFeedback pendingMessage={pendingMessage} error={error} panelOpen={open}/>
    </div>
    {open?<SourceSelectionPanel selected={selected} onChange={onChange} disabled={disabled} onDone={closeAndReturnFocus} pendingMessage={pendingMessage} error={error}/>:null}
  </div>;
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
  return <SourceSelection selected={selected} onChange={change} disabled={pending} pendingMessage={pending?"Updating discovery sources…":undefined} error={error}/>;
}
