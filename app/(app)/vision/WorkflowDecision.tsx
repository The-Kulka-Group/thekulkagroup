import { WORKFLOW_LABELS } from "@/lib/vision/presentation";

export function WorkflowDecision({decision}:{decision:keyof typeof WORKFLOW_LABELS}) {
  const tone=decision==="pursuing"?"working":decision==="won"?"done":"open";
  return <span className={`status-block status-block--${tone} vision-workflow-decision vision-workflow-decision--${decision}`}>{WORKFLOW_LABELS[decision]}</span>;
}
