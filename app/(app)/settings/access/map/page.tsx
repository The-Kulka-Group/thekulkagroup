import { Sheet } from "@/components/Sheet";
import { accessGrid } from "@/lib/access/grid";
import { OWNER_ROLE } from "@/lib/access/level";
import { listPeople, listRoleAccess, listRoles } from "@/lib/access/read";
import { currentViewer } from "@/lib/access/current";
import { getDb } from "@/lib/db";

import { AccessTabs } from "../parts";
import { AccessMap, type MapRole } from "./AccessMap";
import "../access.css";

// LA-3046. Settings, People and Access: the Access Map tab (canvas board 1).

export const dynamic = "force-dynamic";

export default async function AccessMapPage() {
  const db = getDb();
  const [roles, byRole, people, viewer] = await Promise.all([listRoles(db), listRoleAccess(db), listPeople(db), currentViewer()]);
  const mapRoles: MapRole[] = roles.map((r) => ({
    key: r.key,
    name: r.name,
    locked: r.key === OWNER_ROLE,
    people: people.filter((p) => p.roleKey === r.key).map((p) => ({ id: p.id, name: p.name })),
  }));
  return (
    <Sheet number="S-101" title="People and Access" actions={<AccessTabs current="Access Map" />} meta={<span>Settings · Owner Opens Every Tool</span>}>
      <div className="ac-body">
        <AccessMap roles={mapRoles} grid={accessGrid(roles, byRole)} canViewAs={viewer.canViewAs && !viewer.viewingAs} />
      </div>
    </Sheet>
  );
}
