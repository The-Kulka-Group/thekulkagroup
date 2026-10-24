import { Sheet } from "@/components/Sheet";
import { listChanges } from "@/lib/access/read";
import { getDb } from "@/lib/db";

import { AccessTabs } from "../parts";
import { ChangeList } from "./ChangeList";
import "../access.css";

// LA-3046. Settings, People and Access: the Change Log tab (canvas board 4).

export const dynamic = "force-dynamic";

export default async function AccessChangesPage() {
  const changes = await listChanges(getDb());
  return (
    <Sheet number="S-102" title="People and Access" actions={<AccessTabs current="Change Log" />} meta={<span>Settings · Newest First</span>}>
      <div className="ac-body">
        <ChangeList changes={changes} />
      </div>
    </Sheet>
  );
}
