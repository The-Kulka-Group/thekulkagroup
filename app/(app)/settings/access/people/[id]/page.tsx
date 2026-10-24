import Link from "next/link";
import { notFound } from "next/navigation";

import { Sheet } from "@/components/Sheet";
import { listRoleAccess, readPerson } from "@/lib/access/read";
import { currentViewer } from "@/lib/access/current";
import { viewerLevel } from "@/lib/access/viewer";
import { getDb } from "@/lib/db";

import { AccessTabs } from "../../parts";
import { PersonView } from "./PersonView";
import "../../access.css";

// LA-3046. One person's page (canvas board 3).

export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [found, byRole, viewer] = await Promise.all([readPerson(db, id), listRoleAccess(db), currentViewer()]);
  if (!found) notFound();
  return (
    <Sheet
      number="S-110"
      title={found.person.name}
      actions={<AccessTabs current="People" />}
      meta={<span><Link href="/settings/access">People</Link> · {found.person.roleName}</span>}
    >
      <PersonView
        person={found.person}
        exceptions={found.exceptions}
        roleAccess={byRole[found.person.roleKey] ?? []}
        canEdit={viewerLevel(viewer, "access") === "edit"}
        canViewAs={viewer.canViewAs && !viewer.viewingAs}
      />
    </Sheet>
  );
}
