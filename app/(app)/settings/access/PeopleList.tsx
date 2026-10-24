import Link from "next/link";

import type { PersonRow } from "@/lib/access/read";

import { Avatar, ChevronRight } from "./parts";

// LA-3046, canvas board 2. One row per person: who they are, their role, and
// how many exceptions they have. Their tool-by-tool access is one click down,
// on their own page (Rob's simple-first rule, DESIGN.md).

export function PeopleList({ people }: { people: readonly PersonRow[] }) {
  return (
    <section className="ac-card ac-people" aria-label="People">
      <div className="ac-prow ac-prow--head">
        <span>Person</span>
        <span className="ac-hide-sm">Role</span>
        <span>Exceptions</span>
        <span />
      </div>
      {people.map((p) => (
        <Link key={p.id} className="ac-prow" href={`/settings/access/people/${p.id}`}>
          <span className="ac-who">
            <Avatar id={p.id} name={p.name} />
            <span style={{ minWidth: 0 }}>
              <span className="ac-who-name">{p.name}</span>
              <span className="ac-who-sub">{p.title ?? p.email}</span>
            </span>
          </span>
          <span className="ac-hide-sm">{p.roleName}</span>
          {p.exceptionCount ? <span className="ac-exc">{p.exceptionCount}</span> : <span className="ac-none">None</span>}
          <ChevronRight />
        </Link>
      ))}
      {people.length === 0 ? (
        <div className="ac-foot">No one is here yet. Add the first person above.</div>
      ) : (
        <div className="ac-foot">Click a person to see what they can open, tool by tool.</div>
      )}
    </section>
  );
}
