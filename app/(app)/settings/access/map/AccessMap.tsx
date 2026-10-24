"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useCanEdit } from "@/components/access/ToolLevel";
import { ViewAsButton } from "@/components/access/ViewAsBar";
import type { GridDepartment } from "@/lib/access/grid";
import type { Level, TargetKind } from "@/lib/access/level";

import { setRoleLevel } from "../actions";
import { Avatar, LEVEL_LABEL, Mark, MarkKey } from "../parts";

// LA-3046, canvas board 1. Departments fold, so the first screen is one row
// per department; open one to set its tools one at a time. Clicking a box
// opens it in the panel, where a Hidden, View, Edit switch changes it.

export interface MapRole {
  key: string;
  name: string;
  locked: boolean;
  people: { id: string; name: string }[];
}

interface Selected {
  roleKey: string;
  kind: TargetKind;
  key: string;
  departmentKey: string;
}

const LEVELS: Level[] = ["hidden", "view", "edit"];

const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

export function AccessMap({
  roles,
  grid,
  initialOpen = [],
  canViewAs = false,
}: {
  roles: readonly MapRole[];
  grid: readonly GridDepartment[];
  initialOpen?: string[];
  canViewAs?: boolean;
}) {
  const router = useRouter();
  // LA-3047: in View the switch shows the level but cannot change it.
  const canEdit = useCanEdit();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set(initialOpen));
  const firstRole = roles.find((r) => !r.locked);
  const [sel, setSel] = useState<Selected | null>(
    firstRole && grid[0] ? { roleKey: firstRole.key, kind: "department", key: grid[0].department.key, departmentKey: grid[0].department.key } : null,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const columns = `minmax(170px, 1fr) repeat(${roles.length}, 88px)`;
  const roleIndex = sel ? roles.findIndex((r) => r.key === sel.roleKey) : -1;
  const role = roleIndex >= 0 ? roles[roleIndex] : null;
  const dept = sel ? grid.find((d) => d.department.key === sel.departmentKey) : undefined;
  const toolRow = sel?.kind === "tool" ? dept?.tools.find((t) => t.tool.key === sel.key) : undefined;
  const deptCell = dept && roleIndex >= 0 ? dept.cells[roleIndex] : undefined;
  const toolCell = toolRow && roleIndex >= 0 ? toolRow.cells[roleIndex] : undefined;
  const current: Level | null = toolCell ? toolCell.shown : deptCell && deptCell.shown !== "mixed" ? deptCell.shown : null;
  const ownTools = dept && roleIndex >= 0 ? dept.tools.filter((t) => t.cells[roleIndex].set !== null).length : 0;

  function change(level: Level | null) {
    if (!sel || !role) return;
    setError(null);
    startTransition(async () => {
      const result = await setRoleLevel(role.key, sel.kind, sel.key, level);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function toggle(key: string) {
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const isSel = (roleKey: string, kind: TargetKind, key: string) => sel?.roleKey === roleKey && sel.kind === kind && sel.key === key;

  return (
    <div className="ac-map-wrap">
      <section className="ac-card ac-map" aria-label="Access Map">
        <div className="ac-scroll">
          <div className="ac-grid" style={{ gridTemplateColumns: columns }}>
            <div className="ac-gh ac-gh--first">Department and Tool</div>
            {roles.map((r) => (
              <div key={r.key} className={`ac-gh${r.key === sel?.roleKey ? " is-on" : ""}`}>
                <span className="ac-stack">
                  {r.people.slice(0, 3).map((p) => <Avatar key={p.id} id={p.id} name={p.name} size="sm" />)}
                </span>
                <span>{r.name}</span>
              </div>
            ))}
            {grid.map((d) => {
              const isOpen = open.has(d.department.key);
              return (
                <div key={d.department.key} style={{ display: "contents" }}>
                  <div className="ac-sep" />
                  <button type="button" className="ac-dept" aria-expanded={isOpen} onClick={() => toggle(d.department.key)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    {d.department.label}
                    <small>{d.tools.length === 1 ? "1 tool" : `${d.tools.length} tools`}</small>
                  </button>
                  {d.cells.map((c, i) => (
                    <div key={c.roleKey} className="ac-cwrap">
                      <button
                        type="button"
                        className="ac-cell"
                        disabled={c.locked}
                        aria-pressed={isSel(c.roleKey, "department", d.department.key)}
                        aria-label={`${roles[i].name}, ${d.department.label}: ${c.shown === "mixed" ? "Mixed" : LEVEL_LABEL[c.shown]}`}
                        onClick={() => setSel({ roleKey: c.roleKey, kind: "department", key: d.department.key, departmentKey: d.department.key })}
                      >
                        <Mark level={c.shown} />
                      </button>
                    </div>
                  ))}
                  {isOpen
                    ? d.tools.map((t) => (
                        <div key={t.tool.key} style={{ display: "contents" }}>
                          <div className="ac-tool">{t.tool.label}</div>
                          {t.cells.map((c, i) => (
                            <div key={c.roleKey} className="ac-cwrap">
                              <button
                                type="button"
                                className="ac-cell"
                                disabled={c.locked}
                                aria-pressed={isSel(c.roleKey, "tool", t.tool.key)}
                                aria-label={`${roles[i].name}, ${t.tool.label}: ${LEVEL_LABEL[c.shown]}${c.differs ? ", differs from its department" : ""}`}
                                onClick={() => setSel({ roleKey: c.roleKey, kind: "tool", key: t.tool.key, departmentKey: d.department.key })}
                              >
                                <Mark level={c.shown} pin={c.differs} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ))
                    : null}
                </div>
              );
            })}
          </div>
        </div>
        <div className="ac-foot" style={{ display: "flex", flexWrap: "wrap", gap: "var(--s4)", alignItems: "center" }}>
          <span style={{ color: "var(--brand)", fontWeight: 600, marginRight: "auto" }}>Open a department to set one tool at a time.</span>
          <MarkKey mixed pinLabel="Differs From Its Department" />
        </div>
      </section>

      {sel && role && dept ? (
        <aside className="ac-card ac-panel" aria-label="Selected box">
          <div>
            <div className="t-label">{role.name}</div>
            <h2>{toolRow ? toolRow.tool.label : `${dept.department.label} (${dept.tools.length === 1 ? "1 Tool" : `${dept.tools.length} Tools`})`}</h2>
          </div>
          <div className="ac-switch" role="radiogroup" aria-label="Level">
            {LEVELS.map((lv) => (
              <button
                key={lv}
                type="button"
                role="radio"
                aria-checked={current === lv}
                className={lv === "edit" ? "is-edit" : undefined}
                disabled={pending || !canEdit}
                onClick={() => current !== lv && change(lv)}
              >
                <Mark level={lv} />
                {LEVEL_LABEL[lv]}
              </button>
            ))}
          </div>
          <div className="ac-reach">
            <span>
              {role.people.length
                ? `This reaches ${people(role.people.length)} in ${role.name}.`
                : `Nobody holds ${role.name} yet, so this changes no one today.`}
            </span>
            {role.people.length ? (
              <span className="ac-stack">
                {role.people.map((p) => <Avatar key={p.id} id={p.id} name={p.name} size="sm" />)}
              </span>
            ) : null}
          </div>
          {toolCell ? (
            toolCell.set === null ? (
              <span className="ac-note">This tool follows {dept.department.label}.</span>
            ) : (
              <span className="ac-note">
                This tool has its own setting.{" "}
                <button type="button" className="btn btn--quiet" disabled={pending || !canEdit} onClick={() => change(null)}>
                  Follow {dept.department.label}
                </button>
              </span>
            )
          ) : current === null ? (
            <span className="ac-note">Its tools are set differently. Pick a level to set them all, or open the department to set one.</span>
          ) : ownTools ? (
            <span className="ac-note">{ownTools === 1 ? "1 tool keeps" : `${ownTools} tools keep`} its own setting.</span>
          ) : null}
          {error ? <span className="ac-error" role="alert">{error}</span> : null}
          {canViewAs ? <ViewAsButton value={`role:${role.key}`} label={`View As ${role.name}`} /> : null}
          <span className="ac-note" style={{ marginTop: "auto" }}>
            {canEdit ? "Each change saves at once and goes in the Change Log." : "You can view this map, but you cannot change it."}
          </span>
        </aside>
      ) : null}
    </div>
  );
}
