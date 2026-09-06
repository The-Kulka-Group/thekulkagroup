export type WorkflowDecision = "undecided" | "watching" | "pursuing" | "passed" | "won" | "lost";
export type WorkflowPerson = { id: string; name: string; company: string; role: string };
export type WorkflowAction = { id: string; title: string; assigneeEmail: string; dueDate: string | null };
export type WorkflowActivity = { id: string; type: string; actorId: string; actorEmail: string; createdAt: string; description: string };
export type Workflow = { opportunityId: string; revision: number; classification: "opportunity" | "policy"; decision: WorkflowDecision; reviewDate: string | null; nextAction: WorkflowAction | null; people: WorkflowPerson[]; activity: WorkflowActivity[] };
