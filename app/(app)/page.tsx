import { Sheet } from "@/components/Sheet";
import { getDb } from "@/lib/db";
import { listThreadsNeedingKulka, type NeedsKulka } from "@/lib/rom/budget-comment-inbox";

import { HomeThreads } from "./HomeThreads";

export const dynamic = "force-dynamic";

// Home leads with what needs the user: plain sentences, newest first, one
// action each. Only red items take the tinted band; amber sits on white, so
// fill itself carries severity.
//
// LA-1490: the list is every client comment thread that needs Kulka (spec
// Decision 3), one sentence and a Reply action each. The layout has already
// checked sign-in.
async function readNeedsKulka(): Promise<{ items: NeedsKulka[] } | { error: true }> {
  try {
    return { items: await listThreadsNeedingKulka(getDb()) };
  } catch {
    return { error: true };
  }
}

export default async function Home() {
  const read = await readNeedsKulka();
  return (
    <Sheet
      number="H-100"
      title="Home"
      bodyClass="sheet-body--record"
    >
      <div className="record">
        <div className="margin" />
        <div className="col-field sheet-head">
          {"error" in read ? (
            <>
              <h2 className="t-1">Client comments could not be read.</h2>
              <p className="t-meta">Reload the page to try again.</p>
            </>
          ) : read.items.length === 0 ? (
            <>
              <h2 className="t-1">Nothing needs a reply.</h2>
              <p className="t-meta">A client comment that needs Kulka appears here.</p>
            </>
          ) : (
            <>
              <h2 className="t-1">
                {read.items.length === 1 ? "1 client comment needs a reply." : `${read.items.length} client comments need a reply.`}
              </h2>
              <HomeThreads items={read.items} />
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}
