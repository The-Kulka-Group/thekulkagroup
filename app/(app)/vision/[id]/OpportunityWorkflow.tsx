"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { VisionOpportunity } from "@/lib/vision/types";
import type { Workflow, WorkflowPerson } from "@/lib/vision/workflow-types";
import { visionDate, WORKFLOW_LABELS } from "@/lib/vision/presentation";
import { WorkflowDecision } from "../WorkflowDecision";
import "./workflow.css";

const decisions = WORKFLOW_LABELS;
type Data = {workflow:Workflow;staff:string[];people:WorkflowPerson[]};
const value = (form:FormData,key:string) => String(form.get(key) ?? "");
export function OpportunityWorkflow({opportunity,viewerEmail}:{opportunity:VisionOpportunity;viewerEmail:string}) {
  const [data,setData]=useState<Data>();
  const [error,setError]=useState<string>();
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [conflict,setConflict]=useState(false);
  const [query,setQuery]=useState("");
  const [outcome,setOutcome]=useState("continue");
  const [editAction,setEditAction]=useState(false);
  const [actionKey,setActionKey]=useState(0);
  const actionInput=useRef<HTMLInputElement>(null);
  const endpoint=`/api/vision/opportunities/${opportunity.id}/workflow`;
  useEffect(()=>{
    const controller=new AbortController();
    fetch(endpoint,{signal:controller.signal,cache:"no-store"}).then(async response=>{
      const result=await response.json();
      if(!response.ok)throw new Error(result.error || "The workflow could not load.");
      setData(result);
    }).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"The workflow could not load.");});
    return()=>controller.abort();
  },[endpoint]);
  async function reload(){
    setBusy(true);
    try{const response=await fetch(endpoint,{cache:"no-store"});const result=await response.json();if(!response.ok)throw new Error(result.error || "The record could not reload.");setData(result);setOutcome("continue");setConflict(false);setError(undefined);setNotice("The latest saved workflow is shown. Review it before submitting your draft again.");}
    catch(cause){setError(cause instanceof Error?cause.message:"The record could not reload.");}finally{setBusy(false);}
  }
  async function save(action:Record<string,unknown>,message:string){
    if(!data||busy||conflict)return false;
    setBusy(true);setError(undefined);setNotice("");
    try{
      const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...action,expectedRevision:data.workflow.revision})});
      const result=await response.json();
      if(!response.ok){setConflict(response.status===409);throw new Error(result.error || "The change could not be saved.");}
      setData(result);if(action.type==="classification" || action.type==="decision")setOutcome("continue");setNotice(message);return true;
    }catch(cause){setError(cause instanceof Error?cause.message:"The change could not be saved. Check your connection.");return false;}
    finally{setBusy(false);}
  }
  if(!data)return <section className="wf-loading">{error?<><p role="alert">{error}</p><button className="btn" onClick={reload} disabled={busy}>Try again</button></>:<p role="status">Loading the opportunity workflow…</p>}</section>;
  const w=data.workflow;
  const active=w.decision==="pursuing"||w.decision==="watching";
  const disabled=busy||conflict;
  const available=data.people.filter(p=>!w.people.some(link=>link.id===p.id)&&`${p.name} ${p.company}`.toLowerCase().includes(query.toLowerCase()));
  const personOptions=(selected:string)=>data.staff.includes(selected)?data.staff:[selected,...data.staff];
  const actionForm=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();const form=new FormData(event.currentTarget);
    if(await save({type:"action",action:{title:value(form,"title"),assigneeEmail:value(form,"assignee"),dueDate:value(form,"due")||null}},"The next action was saved.")){setEditAction(false);setActionKey(k=>k+1);}
  };
  return <div className="wf">
    <div className="wf-banner"><WorkflowDecision decision={w.decision}/><span className="t-meta">{w.classification==="policy"?"Policy Context":"Opportunity"}</span><span className="t-meta">Changes save to this record.</span></div>
    <div className="wf-feedback" aria-live="polite">{error?<p role="alert" className="input-error">{error}</p>:notice?<p role="status">{notice}</p>:null}{conflict?<button className="btn" onClick={reload} disabled={busy}>Load latest workflow</button>:null}</div>
    <div className="wf-columns"><div>
      <section><h2>Is this worth following?</h2><div className="wf-buttons">{([['pursuing','Pursue'],['watching','Watch'],['passed','Pass']] as const).map(([decision,label])=><button key={decision} className={`btn ${decision==='pursuing'?'btn--primary':''}`} type="button" aria-pressed={w.decision===decision} disabled={disabled || (w.classification==='policy' && decision==='pursuing')} onClick={async()=>{if(await save({type:"decision",decision},decision==='passed'?"The record was passed. Its open action was closed and history was kept.":`The record is now ${decisions[decision].toLowerCase()}.`)){setEditAction(false);if(decision==='pursuing')actionInput.current?.focus();}}}>{label}</button>)}</div>
        <p className="t-meta">{w.classification==='policy'?'Watch policy changes as context. Identify a specific project before pursuing work.':'You can pursue work while the company, contact or value is unknown.'}</p>
        <details className="wf-details"><summary>Record Classification</summary><p className="t-meta">A public policy change is not a construction project. Classification does not change the original source.</p><label>Record Type<select className="input" value={w.classification} disabled={disabled} onChange={event=>void save({type:"classification",classification:event.target.value},"The classification was saved.")}><option value="opportunity">Opportunity</option><option value="policy">Policy Context</option></select></label></details>
        {w.decision==='watching'?<form className="wf-inline" onSubmit={async event=>{event.preventDefault();const form=new FormData(event.currentTarget);await save({type:'reviewDate',reviewDate:value(form,'reviewDate')||null},'The review date was saved.');}}><label>Review on<input className="input" type="date" name="reviewDate" defaultValue={w.reviewDate??''} key={w.reviewDate} disabled={disabled}/></label><button className="btn" disabled={disabled}>Save Review Date</button></form>:null}
      </section>
      <section><h2>What happens next?</h2>
        {w.nextAction?<div className="wf-action"><strong>{w.nextAction.title}</strong><p className="t-meta">{w.nextAction.assigneeEmail===viewerEmail?'Me':w.nextAction.assigneeEmail} · {w.nextAction.dueDate?`Due ${visionDate(w.nextAction.dueDate)}`:'No Due Date'}</p><div className="wf-buttons"><button className="btn btn--quiet" type="button" disabled={disabled} onClick={()=>setEditAction(!editAction)}>{editAction?'Keep Current Action':'Edit Next Action'}</button><button className="btn btn--quiet" type="button" disabled={disabled} onClick={async()=>{if(await save({type:'cancelAction'},'The next action was canceled and its history was kept.')){setEditAction(false);setActionKey(k=>k+1);}}}>Cancel Action</button></div></div>:<p className="t-meta">{active?'There is no next action yet.':'Choose Pursue or Watch to start assigning work.'}</p>}
        {active&&(!w.nextAction||editAction)?<form onSubmit={actionForm} key={actionKey}><div className="wf-fields"><label className="wf-wide">Next Action<input ref={actionInput} className="input" name="title" required maxLength={300} defaultValue={w.nextAction?.title??''} placeholder="For example, find the project contact" disabled={disabled}/></label><label>Responsible Person<select className="input" name="assignee" defaultValue={w.nextAction?.assigneeEmail??viewerEmail} disabled={disabled}>{personOptions(w.nextAction?.assigneeEmail??viewerEmail).map(email=><option key={email} value={email}>{email===viewerEmail?'Me':email}</option>)}</select></label><label>Due Date (Optional)<input className="input" type="date" name="due" defaultValue={w.nextAction?.dueDate??''} disabled={disabled}/></label></div><button className="btn btn--primary" disabled={disabled}>{w.nextAction?'Save Next Action':'Set Next Action'}</button></form>:null}
      </section>
      <section><h2>Who is involved?</h2>{w.people.length?<ul className="wf-people">{w.people.map(person=><li key={person.id}><div><strong>{person.name}</strong><span className="vision-cell-meta">{[person.company,person.role].filter(Boolean).join(' · ')||'Company and role are unknown.'}</span></div><button className="btn btn--quiet" type="button" disabled={disabled} aria-label={`Unlink ${person.name}`} onClick={()=>void save({type:'unlinkPerson',personId:person.id},'The person was unlinked. Earlier activity was kept.')}>Unlink</button></li>)}</ul>:<p className="t-meta">The project contact is unknown. You can keep moving.</p>}
        <details className="wf-details"><summary>Add or Link a Person</summary>
          {data.people.length?<form onSubmit={async event=>{event.preventDefault();const element=event.currentTarget,form=new FormData(element);if(await save({type:'person',personId:value(form,'personId'),role:value(form,'role')},'The person was linked.')){element.reset();setQuery('');}}}><label>Find an Existing Person<input className="input" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name or company"/></label><label>Existing Person<select className="input" name="personId" required disabled={disabled}><option value="">Choose a Person</option>{available.map(p=><option key={p.id} value={p.id}>{p.name}{p.company?` · ${p.company}`:''}</option>)}</select></label><label>Role Here (Optional)<input className="input" name="role" maxLength={150} disabled={disabled}/></label><button className="btn" disabled={disabled}>Link Person</button></form>:null}
          <form onSubmit={async event=>{event.preventDefault();const element=event.currentTarget,form=new FormData(element);if(await save({type:'person',person:{name:value(form,'name'),company:value(form,'company'),role:value(form,'role')}},'The person was added here.'))element.reset();}}><h3>Add a New Person</h3><div className="wf-fields"><label>Name<input className="input" name="name" required maxLength={150} disabled={disabled}/></label><label>Company (Optional)<input className="input" name="company" maxLength={150} disabled={disabled}/></label><label className="wf-wide">Role Here (Optional)<input className="input" name="role" maxLength={150} disabled={disabled}/></label></div><button className="btn" disabled={disabled}>Add Person</button></form>
        </details>
      </section>
      <section><h2>What happened?</h2>{active?<form onSubmit={async event=>{event.preventDefault();const element=event.currentTarget,form=new FormData(element);const nextTitle=value(form,'nextTitle');if(await save({type:'result',result:value(form,'result'),...(outcome!=='continue'?{outcome}:{}),awardEvidence:value(form,'awardEvidence'),...(nextTitle&&outcome==='continue'?{nextAction:{title:nextTitle,assigneeEmail:value(form,'nextAssignee'),dueDate:value(form,'nextDue')||null}}:{})},outcome==='continue'?'The result and next action were saved.':'The outcome was saved and the open action was closed.')){element.reset();setOutcome('continue');setEditAction(false);setActionKey(k=>k+1);}}}>
        <label>Result or Note<textarea className="input" name="result" required maxLength={1500} rows={3} disabled={disabled} placeholder="Record what you learned or what happened."/></label><label>After This Result<select className="input" value={outcome} onChange={e=>setOutcome(e.target.value)} disabled={disabled}><option value="continue">Keep Following</option><option value="passed">We Are Passing</option>{w.classification!=='policy'?<><option value="won">Work Awarded to Kulka</option><option value="lost">Work Awarded Elsewhere</option></>:null}</select></label>
        {outcome==='won'?<label>Award Evidence<input className="input" name="awardEvidence" required maxLength={500} disabled={disabled} placeholder="Document reference or confirmation source"/></label>:null}
        {outcome==='continue'?<details className="wf-details"><summary>Set the Next Step with This Result</summary><div className="wf-fields"><label className="wf-wide">Next Step (Optional)<input className="input" name="nextTitle" maxLength={300} disabled={disabled}/></label><label>Responsible Person<select className="input" name="nextAssignee" defaultValue={w.nextAction?.assigneeEmail??viewerEmail} disabled={disabled}>{personOptions(w.nextAction?.assigneeEmail??viewerEmail).map(email=><option key={email} value={email}>{email===viewerEmail?'Me':email}</option>)}</select></label><label>Due Date (Optional)<input className="input" name="nextDue" type="date" disabled={disabled}/></label></div></details>:null}
        <button className="btn btn--primary" disabled={disabled}>{w.nextAction?'Complete Action and Record Result':'Record Result'}</button><p className="t-meta">{w.nextAction?'This completes the current action and keeps its history.':'The result is added to the activity below.'} Nothing sends a message.</p>
      </form>:<p className="t-meta">{['won','lost','passed'].includes(w.decision)?'The record is closed. Choose Pursue or Watch to reopen it.':'Choose Pursue or Watch before recording work results.'}</p>}</section>
    </div><aside>
      <section><h2>What We Know</h2><dl><dt>Public Source</dt><dd><a className="vision-link-pill" href={opportunity.sourceUrl} target="_blank" rel="noopener noreferrer">{opportunity.sourceTitle}</a></dd><dt>Location</dt><dd>{opportunity.address||'The address is unknown.'}</dd><dt>Publication Date</dt><dd>{opportunity.sourceDate?visionDate(opportunity.sourceDate):'Unknown'}</dd><dt>Original Notes</dt><dd className="wf-notes">{opportunity.notes||'No original notes have been saved.'}</dd></dl><p className="t-meta">The source is evidence of a filing. It does not confirm available work or an award.</p></section>
      <section><h2>Activity</h2>{w.activity.length?<ol className="wf-activity">{[...w.activity].reverse().map(item=><li key={item.id}><p>{item.description}</p><span className="t-meta">{item.actorEmail===viewerEmail?'Me':item.actorEmail} · {new Date(item.createdAt).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})}</span></li>)}</ol>:<p className="t-meta">No workflow activity has been recorded.</p>}</section>
    </aside></div>
  </div>;
}
