import { tier1Flow } from "@/lib/rom/question-flow";

import { IntakeFlow } from "./IntakeFlow";

// The questions are not in this file and not in the component. They are read
// from `config/rom/tier1-flow.json` on the server and handed down, so editing
// that file changes what the page asks.
export default function RomIntakePage() {
  return <IntakeFlow definition={tier1Flow()} projectId={process.env.ROM_PROJECT_ID} />;
}
