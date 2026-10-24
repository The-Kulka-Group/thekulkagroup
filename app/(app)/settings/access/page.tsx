import { Sheet } from "@/components/Sheet";
import { listPeople, listRoles } from "@/lib/access/read";
import { getDb } from "@/lib/db";

import { AddPerson } from "./AddPerson";
import { AccessTabs, SignInOff } from "./parts";
import { PeopleList } from "./PeopleList";
import "./access.css";

// LA-3046. Settings, People and Access: the People tab (canvas board 2).

export const dynamic = "force-dynamic";

export default async function AccessPeoplePage() {
  const db = getDb();
  const [people, roles] = await Promise.all([listPeople(db), listRoles(db)]);
  return (
    <Sheet
      number="S-100"
      title="People and Access"
      actions={<AccessTabs current="People" />}
      meta={<span>Settings · {people.length === 1 ? "1 Person" : `${people.length} People`}</span>}
    >
      <div className="ac-body">
        <SignInOff people={people.length} />
        <AddPerson roles={roles} />
        <PeopleList people={people} />
      </div>
    </Sheet>
  );
}
