import { randomUUID } from "node:crypto";
import type { Db } from "@/lib/db";
import type { AuthorizedUser } from "@/lib/auth/server";
import { allowedEmailsFrom } from "@/lib/auth/policy";
import { isUuid } from "@/lib/uuid";
import { InvalidVisionInput } from "./input";
import type { Workflow, WorkflowAction, WorkflowPerson, WorkflowDecision } from "./workflow-types";
export class WorkflowConflict extends Error { constructor() { super("This workflow changed. Reload it before saving again."); } }
const closed = (decision: WorkflowDecision) => ["passed", "won", "lost"].includes(decision);
const active = (decision: WorkflowDecision) => ["watching", "pursuing"].includes(decision);
const actionDescription = (action: WorkflowAction) => `${action.title}. Assigned to ${action.assigneeEmail}${action.dueDate ? `, due ${action.dueDate}` : ""}.`;
const initial = (id: string): Workflow => ({ opportunityId: id, revision: 0, classification: "opportunity", decision: "undecided", reviewDate: null, nextAction: null, people: [], activity: [] });
export function workflowStaff(actorEmail: string): string[] {
  // The actor has already passed authorization. This also supports the isolated browser-test identity.
  return [...new Set([...(allowedEmailsFrom(process.env.KULKA_AUTH_ALLOWED_EMAILS) ?? []), actorEmail])].sort();
}
export async function getWorkflow(db: Db, id: string): Promise<Workflow | null> {
 const { rows } = await db.query<{ state: Workflow | null }>(`select w.state from vision_opportunities o left join vision_workflows w on w.opportunity_id=o.id where o.id=$1`, [id]);
 return rows.length ? rows[0].state ?? initial(id) : null;
}
export async function listWorkflowSummaries(db: Db, ids: string[]): Promise<Workflow[]> {
 if (!ids.length) return [];
 const { rows } = await db.query<{ id: string; state: Workflow | null }>(`select o.id,w.state from vision_opportunities o left join vision_workflows w on w.opportunity_id=o.id where o.id=any($1::uuid[])`, [ids]);
 return rows.map(row => row.state ?? initial(row.id));
}
export async function listWorkflowPeople(db: Db): Promise<WorkflowPerson[]> {
 return (await db.query<WorkflowPerson>("select id,name,company,role from vision_people order by lower(name),id")).rows;
}
function object(value: unknown): Record<string, unknown> {
 if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvalidVisionInput("Send a valid workflow change.");
 return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number, required = true): string {
 if (value === undefined && !required) return "";
 if (typeof value !== "string" || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || value.length > max || (required && !value.trim())) throw new InvalidVisionInput(`Enter a valid ${label}.`);
 return value.trim();
}
function classification(value: unknown): Workflow["classification"] {
 if (value !== "opportunity" && value !== "policy") throw new InvalidVisionInput("Choose opportunity or policy context.");
 return value;
}
function date(value: unknown): string | null {
 const result = value == null || value === "" ? null : text(value, "date", 10);
 if (result && (!/^\d{4}-\d{2}-\d{2}$/.test(result) || result.startsWith("0000") || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0,10) !== result)) throw new InvalidVisionInput("Enter a valid calendar date.");
 return result;
}
function action(value: unknown, staff: string[]): WorkflowAction {
 const data = object(value);
 const assigneeEmail = text(data.assigneeEmail, "assignee", 320).toLowerCase();
 if (!staff.includes(assigneeEmail)) throw new InvalidVisionInput("Choose an authorized colleague.");
 const dueDate = date(data.dueDate);
 return { id: randomUUID(), title: text(data.title, "next action", 1000), assigneeEmail, dueDate };
}
export async function updateWorkflow(db: Db, id: string, input: unknown, actor: AuthorizedUser): Promise<Workflow | null> {
 if (actor.temporary) throw new InvalidVisionInput("Sign in to change the workflow.");
 const body = object(input);
 if (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) throw new InvalidVisionInput("Supply the current workflow revision.");
 const current = await getWorkflow(db, id);
 if (!current) return null;
 if (current.revision !== body.expectedRevision) throw new WorkflowConflict();
 const next = structuredClone(current);
 let description: string;
 let newPerson: WorkflowPerson | null = null;
 switch (body.type) {
  case "reviewDate":
   if (next.decision !== "watching") throw new InvalidVisionInput("Choose Watching before scheduling a review date.");
   next.reviewDate = date(body.reviewDate);
   description = next.reviewDate ? `Review scheduled for ${next.reviewDate}.` : "Review date cleared.";
   break;
  case "cancelAction":
   if (!next.nextAction) throw new InvalidVisionInput("There is no open next action to cancel.");
   description = `Cancelled action: ${actionDescription(next.nextAction)}`;
   next.nextAction = null;
   break;
  case "unlinkPerson": {
   const person = next.people.find(person => person.id === body.personId);
   if (!person) throw new InvalidVisionInput("This person is not linked to the opportunity.");
   next.people = next.people.filter(item => item.id !== person.id);
   description = `Unlinked ${person.name}.`;
   break;
  }
  case "classification":
   next.classification = classification(body.classification);
   description = `Classified as ${next.classification === "policy" ? "policy context" : "an opportunity"}.`;
   break;
  case "decision": {
   if (!["undecided", "watching", "pursuing", "passed"].includes(String(body.decision))) throw new InvalidVisionInput("Choose a decision. Record a result to mark work won or lost.");
   next.decision = body.decision as WorkflowDecision;
   if (body.classification !== undefined) next.classification = classification(body.classification);
   if (closed(next.decision)) { next.nextAction = null; next.reviewDate = null; }
   if (next.decision !== "watching") next.reviewDate = null;
   description = `Decision changed to ${next.decision}.`;
   if (closed(next.decision) && current.nextAction) description += ` Cancelled action: ${actionDescription(current.nextAction)}`;
   break;
  }
  case "action":
   if (!active(next.decision)) throw new InvalidVisionInput("Choose Watching or Pursuing before assigning work.");
   next.nextAction = action(body.action, workflowStaff(actor.email));
   description = `Next action: ${next.nextAction.title}. Assigned to ${next.nextAction.assigneeEmail}${next.nextAction.dueDate ? `, due ${next.nextAction.dueDate}` : ""}.`;
   break;
  case "person": {
   let person: WorkflowPerson;
   if (body.personId !== undefined) {
    if (typeof body.personId !== "string" || !isUuid(body.personId)) throw new InvalidVisionInput("Choose a valid person.");
    const rows = await db.query<WorkflowPerson>("select id,name,company,role from vision_people where id=$1", [body.personId]);
    if (!rows.rows[0]) throw new InvalidVisionInput("This person no longer exists.");
    person = {...rows.rows[0], role: text(body.role, "role", 200, false)};
   } else {
    const data = object(body.person);
    person = { id: randomUUID(), name: text(data.name, "person name", 200), company: text(data.company, "company", 200, false), role: text(data.role, "role", 200, false) };
    newPerson = {...person, role: ""};
   }
   if (next.people.some(item => item.id === person.id)) throw new InvalidVisionInput("This person is already linked.");
   next.people.push(person);
   description = `Linked ${person.name}${person.company ? ` at ${person.company}` : ""}${person.role ? ` (${person.role})` : ""}.`;
   break;
  }
  case "result": {
   if (!active(next.decision)) throw new InvalidVisionInput("Choose Watching or Pursuing before recording a result.");
   const result = text(body.result, "result", 10000);
   if (body.outcome !== undefined && body.outcome !== "won" && body.outcome !== "lost") throw new InvalidVisionInput("Choose a valid outcome.");
   if (body.outcome && body.nextAction != null) throw new InvalidVisionInput("Closed work cannot have a next action.");
   let awardEvidence = "";
   if (body.outcome === "won") awardEvidence = text(body.awardEvidence, "award evidence", 4000);
   description = `${current.nextAction ? `Completed: ${actionDescription(current.nextAction)} ` : ""}${result}${body.outcome ? ` Outcome: ${body.outcome}.` : ""}${awardEvidence ? ` Award evidence: ${awardEvidence}` : ""}`;
   next.nextAction = body.nextAction == null ? null : action(body.nextAction, workflowStaff(actor.email));
   if (body.outcome) { next.decision = body.outcome; next.reviewDate = null; }
   if (next.nextAction) description += ` Next action: ${next.nextAction.title}. Assigned to ${next.nextAction.assigneeEmail}${next.nextAction.dueDate ? `, due ${next.nextAction.dueDate}` : ""}.`;
   break;
  }
  default: throw new InvalidVisionInput("Choose a valid workflow change.");
 }
 if (next.classification === "policy" && ["pursuing", "won", "lost"].includes(next.decision)) throw new InvalidVisionInput("Policy context can be watched or passed, but cannot be pursued, won or lost.");
 next.revision++;
 // Database time and authenticated actor form the audit entry. The revision gate also gates contact creation.
 const event = { id: randomUUID(), type: String(body.type), actorId: actor.id, actorEmail: actor.email, description };
 const { rows } = await db.query<{ state: Workflow }>(`with changed as (
 insert into vision_workflows (opportunity_id,revision,state)
 values ($1,$2,$3::jsonb || jsonb_build_object('activity',($3::jsonb->'activity') || jsonb_build_array($4::jsonb || jsonb_build_object('createdAt',clock_timestamp()))))
 on conflict (opportunity_id) do update set revision=excluded.revision,state=excluded.state,updated_at=clock_timestamp()
 where vision_workflows.revision=$5 returning state
 ), person_added as (
 insert into vision_people(id,name,company,role)
 select $6::uuid,$7,$8,$9 from changed where $6::uuid is not null returning id
 ) select state from changed`, [id,next.revision,JSON.stringify(next),JSON.stringify(event),current.revision,newPerson?.id ?? null,newPerson?.name ?? "",newPerson?.company ?? "",newPerson?.role ?? ""]);
 if (!rows[0]) throw new WorkflowConflict();
 return rows[0].state;
}
