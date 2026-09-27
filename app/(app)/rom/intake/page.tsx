import { redirect } from "next/navigation";

// LA-1141. The guided New budget flow on /rom (GuidedNewBudget.tsx) now asks
// everything this page used to: the tier-1 facts, plus parking, the nine
// scope gates and GRs/GCs that intake never asked at all. A `?project=<id>`
// link still resolves to that same project on /rom, so nothing bookmarked or
// shared before this change goes dead; everything else opens the guided New
// budget panel with `?new=1`.
export default async function RomIntakePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>;
}) {
  const { project } = await searchParams;
  const asked = Array.isArray(project) ? project[0] : project;
  redirect(asked ? `/rom?project=${encodeURIComponent(asked)}` : "/rom?new=1");
}
