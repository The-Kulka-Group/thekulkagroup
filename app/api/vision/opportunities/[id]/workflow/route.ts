import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { isUuid } from "@/lib/uuid";
import { InvalidVisionInput } from "@/lib/vision/input";
import { getWorkflow, updateWorkflow, listWorkflowPeople, workflowStaff, WorkflowConflict } from "@/lib/vision/workflow";
type Context = { params: Promise<{ id: string }> };
async function handle(request: Request, context: Context, write: boolean) {
 const auth = await authorizeRequest(request);
 if (!auth.ok) return NextResponse.json({error: auth.error}, {status: auth.status});
 const {id} = await context.params;
 if (!isUuid(id)) return NextResponse.json({error: "Opportunity not found."}, {status: 404});
 let input: unknown;
 if (write) { try { input = await request.json(); } catch { return NextResponse.json({error: "Send a JSON body."}, {status: 400}); } }
 try {
  const db = getDb();
  const workflow = write ? await updateWorkflow(db,id,input,auth.user) : await getWorkflow(db,id);
  if (!workflow) return NextResponse.json({error: "Opportunity not found."}, {status: 404});
  return NextResponse.json({workflow,staff: workflowStaff(auth.user.email),people: await listWorkflowPeople(db)}, {headers: {"Cache-Control": "private, no-store"}});
 } catch (error) {
  if (error instanceof InvalidVisionInput || error instanceof WorkflowConflict) return NextResponse.json({error:error.message}, {status:error instanceof WorkflowConflict ? 409 : 400});
  throw error;
 }
}
export const GET = (request: Request, context: Context) => handle(request, context, false);
export const POST = (request: Request, context: Context) => handle(request, context, true);
