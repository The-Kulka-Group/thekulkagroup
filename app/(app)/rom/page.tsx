import { RomRunner } from "./RomRunner";

// The page only runs against a project that Kulka has approved and configured.
// Production starts empty, so there is no invented fallback project or value.
export default function RomPage() {
  return <RomRunner projectId={process.env.ROM_PROJECT_ID} />;
}
