import Link from "next/link";

import { isoDay, levelFor, OWNER_ROLE, type AccessSetting, type Level } from "@/lib/access/level";
import { targetName, type ExceptionRow, type PersonRow } from "@/lib/access/read";
import { DEPARTMENTS, TOOLS } from "@/lib/tools/catalog";

import { Avatar, LEVEL_LABEL, Mark } from "../../parts";
import { AddException, RemoveException } from "./ExceptionControls";

// LA-3046, canvas board 3. Who the person is, what they can open, and the
// exceptions that set them apart from their role. Exceptions carry the purple
// pin; role access never does.

const ENDS = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function ends(day: string | null) {
  return day ? `Ends ${ENDS.format(new Date(`${day}T00:00:00Z`))}` : "No End Date";
}

export function PersonView({
  person,
  exceptions,
  roleAccess,
  today = isoDay(),
}: {
  person: PersonRow;
  exceptions: readonly ExceptionRow[];
  roleAccess: readonly AccessSetting[];
  today?: string;
}) {
  const roleOnly = { roleKey: person.roleKey, roleAccess, exceptions: [] };
  const withExc = { roleKey: person.roleKey, roleAccess, exceptions };
  const tools = TOOLS.map((tool) => {
    const level = levelFor(withExc, tool.key, today);
    const fromRole = levelFor(roleOnly, tool.key, today);
    return { tool, level, isException: level !== fromRole };
  });
  const count = (lv: Level) => tools.filter((t) => t.level === lv).length;
  const first = person.name.split(" ")[0];
  const isOwner = person.roleKey === OWNER_ROLE;

  return (
    <div className="ac-body">
      <section className="ac-card ac-section" aria-label="Person">
        <div className="ac-who" style={{ gap: "var(--s4)" }}>
          <Avatar id={person.id} name={person.name} size="lg" />
          <span style={{ minWidth: 0 }}>
            <span className="ac-who-name" style={{ fontSize: "var(--t2-size)", lineHeight: "var(--t2-line)", fontWeight: 800 }}>{person.name}</span>
            <span className="ac-who-sub">{[person.title, person.roleName, person.email].filter(Boolean).join(" · ")}</span>
          </span>
        </div>
        <div className="ac-strip" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", display: "grid", paddingTop: "var(--s3)", borderTop: "1px solid var(--border-light)" }}>
          {(["edit", "view", "hidden"] as const).map((lv) => (
            <span key={lv} style={{ display: "grid", gap: 4 }}>
              <span className="ac-key"><span><Mark level={lv} />{lv === "edit" ? "Edits" : lv === "view" ? "Views" : "Hidden"}</span></span>
              <b className="num" style={{ fontSize: "var(--t2-size)", color: "var(--brand)" }}>{count(lv)}</b>
            </span>
          ))}
        </div>
      </section>

      <div className="ac-person">
        <section className="ac-card ac-section" aria-label="Exceptions">
          <h2>{exceptions.length === 0 ? "No Exceptions" : exceptions.length === 1 ? "1 Exception" : `${exceptions.length} Exceptions`}</h2>
          {isOwner ? <p className="ac-note">An Owner opens every tool at Edit and takes no exceptions.</p> : null}
          {!isOwner && exceptions.length === 0 ? <p className="ac-note">{first} gets exactly what {person.roleName} gives.</p> : null}
          {exceptions.map((x) => {
            const role = x.targetKind === "tool" ? levelFor(roleOnly, x.targetKey, today) : null;
            const expired = x.endsOn !== null && x.endsOn < today;
            return (
              <div key={`${x.targetKind}:${x.targetKey}`} className="ac-xrow">
                <div className="ac-xmain">
                  <span className="ac-xtop">
                    {targetName(x.targetKind, x.targetKey)}
                    {x.targetKind === "department" ? <span className="ac-none">Whole Department</span> : null}
                    {role ? <Mark level={role} /> : null}
                    {role ? <span aria-hidden="true">→</span> : null}
                    <Mark level={x.level} pin />
                    <span className="ac-none">{role ? `${LEVEL_LABEL[role]} to ${LEVEL_LABEL[x.level]}` : LEVEL_LABEL[x.level]}</span>
                  </span>
                  <span className="ac-xmeta">{x.reason}</span>
                  <span className="ac-xmeta">{expired ? "Ended, so the role decides again" : ends(x.endsOn)} · Set by {x.setBy}</span>
                </div>
                <RemoveException personId={person.id} targetKind={x.targetKind} targetKey={x.targetKey} label={targetName(x.targetKind, x.targetKey)} />
              </div>
            );
          })}
          {isOwner ? null : (
            <AddException
              personId={person.id}
              targets={[
                ...TOOLS.map((t) => ({ value: `tool:${t.key}`, label: t.label })),
                ...DEPARTMENTS.map((d) => ({ value: `department:${d.key}`, label: `${d.label} (Whole Department)` })),
              ]}
            />
          )}
        </section>

        <section className="ac-card ac-section" aria-label="What they can open">
          <h2>What {first} Can Open</h2>
          <div className="ac-strip">
            {tools.map(({ tool, level, isException }) => (
              <div key={tool.key} className="ac-strip-row">
                <span>{tool.label}</span>
                <span><Mark level={level} pin={isException} />{LEVEL_LABEL[level]}{isException ? ", Exception" : ""}</span>
              </div>
            ))}
          </div>
          <p className="ac-note">
            Role access comes from <Link href="/settings/access/map">the Access Map</Link>. A purple pin is this person&rsquo;s own exception.
          </p>
        </section>
      </div>
    </div>
  );
}
