import { Rail } from "@/components/Rail";
import { RAIL_COOKIE } from "@/components/rail-cookie";
import { authIsOpen, authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { countThreadsNeedingKulka } from "@/lib/rom/budget-comment-inbox";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// LA-1490: the Rail's count of client comment threads that need Kulka. A
// failed read must never take the whole app down, so it shows no count.
async function needsKulkaCount(): Promise<number> {
  try {
    return await countThreadsNeedingKulka(getDb());
  } catch {
    return 0;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await authorizeRequest();
  if (!auth.ok) redirect("/login");
  // LA-1330: Keep Open is remembered in a cookie so a pinned rail paints
  // pinned on the first frame instead of opening a beat after load.
  const pinned = (await cookies()).get(RAIL_COOKIE)?.value === "pinned";
  return (
    <div className="app" data-rail={pinned ? "pinned" : "hover"}>
      {/* LA-1330: the first Tab offers the sheet, so a keyboard user does
          not walk the whole rail on every page. */}
      <a className="skip-link" href="#sheet">Skip to the Sheet</a>
      <Rail email={auth.user.email} openAccess={authIsOpen()} initialPinned={pinned} needsKulka={await needsKulkaCount()} />
      <main className="field" id="sheet" tabIndex={-1}>{children}</main>
    </div>
  );
}
