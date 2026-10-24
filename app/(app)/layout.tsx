import { ViewAsBar } from "@/components/access/ViewAsBar";
import { Rail } from "@/components/Rail";
import { currentViewer } from "@/lib/access/current";
import { visibleToolKeys } from "@/lib/access/viewer";
import { authIsOpen, authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { countThreadsNeedingKulka } from "@/lib/rom/budget-comment-inbox";
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
  // LA-3047: the rail shows only the tools the viewer can open.
  const viewer = await currentViewer();
  const viewingAs = viewer.viewingAs;
  return (
    <div className="app">
      {/* LA-1330: the first Tab offers the sheet, so a keyboard user does
          not walk the whole rail on every page. */}
      <a className="skip-link" href="#sheet">Skip to the Sheet</a>
      <Rail email={auth.user.email} openAccess={authIsOpen()} needsKulka={await needsKulkaCount()} tools={visibleToolKeys(viewer)} />
      <main className="field" id="sheet" tabIndex={-1}>
        {viewingAs ? (
          <div className="field-stack">
            <ViewAsBar name={viewingAs.name} roleName={viewingAs.roleName} kind={viewingAs.kind} />
            {children}
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
