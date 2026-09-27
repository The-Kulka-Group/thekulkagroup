import {
  PARAMETER_NAMES,
  parameterProblems,
  type Answers,
  type DataSnapshot,
  type EngineParameter,
  type ParameterName,
  type ParameterProblem,
} from "@kulka/engine";

import { OPEN_ACCESS_USER, type AuthorizedUser } from "@/lib/auth/server";
import type { Db } from "@/lib/db";
import { toDateOnly, toIso } from "@/lib/rom/date";
import { readApprovedJudgmentRules } from "@/lib/rom/judgment";
import { assembleSnapshot, readBenchmarkData, readParameterData, ROM_SKILL } from "@/lib/rom/run";

// The Engine Parameters screen's server side (LA-866). engine_parameters is a
// history: every change is a new row, and the current value of a name is its
// newest row (20260927190000_engine_parameter_history.sql). Nothing here
// updates or deletes a row.

/** One recorded value of one parameter. */
export type ParameterHistoryEntry = {
  id: string;
  name: ParameterName;
  value: number;
  provenance: EngineParameter["provenance"];
  createdAt: string;
};

type HistoryRow = {
  id: string;
  name: string;
  value: string;
  provenance_kind: EngineParameter["provenance"]["kind"];
  provenance_recorded_by: string;
  provenance_recorded_at: Date | string;
  reason: string;
  created_at: Date | string;
};

const KNOWN: ReadonlySet<string> = new Set(PARAMETER_NAMES);

/** Every recorded value of every parameter the engine reads, newest first within each name. */
export async function readParameterHistory(db: Db): Promise<ParameterHistoryEntry[]> {
  const { rows } = await db.query<HistoryRow>(
    `select id, name, value, provenance_kind, provenance_recorded_by,
            provenance_recorded_at, reason, created_at
       from engine_parameters
      order by name, created_at desc, id desc`,
  );
  return rows
    .filter((row) => KNOWN.has(row.name))
    .map((row) => ({
      id: row.id,
      name: row.name as ParameterName,
      value: Number(row.value),
      provenance: {
        kind: row.provenance_kind,
        recordedBy: row.provenance_recorded_by,
        recordedAt: toDateOnly(row.provenance_recorded_at),
        reason: row.reason,
      },
      createdAt: toIso(row.created_at),
    }));
}

/** A change the save path refused. Nothing was written. */
export class ParameterChangeRefused extends Error {
  constructor(
    message: string,
    readonly problems: ParameterProblem[] = [],
  ) {
    super(message);
    this.name = "ParameterChangeRefused";
  }
}

export type ParameterChange = {
  /** The new value of each name being changed, as the engine reads it (fractions, not percents). */
  values: Partial<Record<ParameterName, number>>;
  /** Why, in plain words. Required: a bare number is refused (ADR 0005). */
  reason: string;
  /** Who, as recordedByFor names them. */
  recordedBy: string;
  /** ISO date the change is recorded on. */
  recordedAt: string;
};

export type SavedParameterChange = { saved: ParameterHistoryEntry[] };

/**
 * Who a change is recorded as. While sign-in is off, anyone who can open the
 * app may change a parameter, and the history names them `open-access` (Matt,
 * 2026-09-27, on LA-866). Otherwise it is the signed-in email.
 */
export function recordedByFor(user: AuthorizedUser): string {
  return user.id === OPEN_ACCESS_USER.id ? "open-access" : user.email;
}

/** Today's date in New York, where Kulka works, as an ISO date. */
export function todayInNewYork(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Append one history row per changed name, all with the same reason, in one
 * transaction. The whole set the next run would read (current values plus
 * these) is checked with the engine's own rules first; if the engine would
 * refuse it, nothing is written. A value equal to the current one is not a
 * change and writes nothing.
 */
export async function saveParameterChange(db: Db, change: ParameterChange): Promise<SavedParameterChange> {
  const reason = change.reason.trim();
  if (!reason) throw new ParameterChangeRefused("Write a reason for this change.");
  if (!change.recordedBy.trim()) throw new ParameterChangeRefused("A change needs the person who made it.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(change.recordedAt)) {
    throw new ParameterChangeRefused("A change needs the date it was made.");
  }

  const names = Object.keys(change.values);
  const unknown = names.filter((name) => !KNOWN.has(name));
  if (unknown.length > 0) {
    throw new ParameterChangeRefused(`The engine reads no parameter named ${unknown.join(", ")}.`);
  }
  for (const name of names as ParameterName[]) {
    if (typeof change.values[name] !== "number") {
      throw new ParameterChangeRefused(`Send ${name} as a number.`);
    }
  }

  return db.withTransaction(async (tx) => {
    // One save at a time, so two people saving at once cannot each pass the
    // check against a set the other is about to change.
    await tx.query(`lock table engine_parameters in share row exclusive mode`);
    const { rows: current } = await tx.query<{ name: string; value: string }>(
      `select name, value from engine_parameters_current`,
    );
    const values: Partial<Record<ParameterName, number>> = {};
    for (const row of current) {
      if (KNOWN.has(row.name)) values[row.name as ParameterName] = Number(row.value);
    }

    const changed = (names as ParameterName[]).filter((name) => values[name] !== change.values[name]);
    if (changed.length === 0) throw new ParameterChangeRefused("Nothing changed, so nothing was saved.");

    const next = { ...values, ...change.values };
    const problems = parameterProblems(next);
    if (problems.length > 0) {
      throw new ParameterChangeRefused("The engine would refuse these values, so nothing was saved.", problems);
    }

    const saved: ParameterHistoryEntry[] = [];
    for (const name of PARAMETER_NAMES.filter((n) => changed.includes(n))) {
      const { rows } = await tx.query<HistoryRow>(
        `insert into engine_parameters
           (name, value, provenance_kind, provenance_recorded_by, provenance_recorded_at, reason)
         values ($1, $2, 'reviewed_judgment', $3, $4, $5)
         returning id, name, value, provenance_kind, provenance_recorded_by,
                   provenance_recorded_at, reason, created_at`,
        [name, next[name], change.recordedBy.trim(), change.recordedAt, reason],
      );
      const row = rows[0];
      saved.push({
        id: row.id,
        name,
        value: Number(row.value),
        provenance: {
          kind: row.provenance_kind,
          recordedBy: row.provenance_recorded_by,
          recordedAt: toDateOnly(row.provenance_recorded_at),
          reason: row.reason,
        },
        createdAt: toIso(row.created_at),
      });
    }
    return { saved };
  });
}

/** One saved run the What Your Change Would Do panel recomputes. */
export type ImpactRun = {
  runId: string;
  projectName: string;
  startedAt: string;
  grossSquareFeet: number;
  /** The answers the run recorded, which is everything the engine needs from it. */
  answers: Answers;
  /** The key of the snapshot, without parameters, this run recomputes over. */
  snapshotKey: string;
};

export type ImpactData = {
  runs: ImpactRun[];
  /** Today's data for each project type, kind and markup choice, without parameters. */
  snapshots: Record<string, Omit<DataSnapshot, "parameters">>;
};

type ImpactRow = {
  id: string;
  project_name: string;
  started_at: Date | string;
  answers: (Answers & { flow?: unknown }) | null;
};

export const IMPACT_RUN_LIMIT = 5;

/**
 * The newest finished run of each project, up to five projects, with the
 * answers each recorded and today's data to recompute them over. The panel
 * runs the engine on each twice in the browser, once with the saved
 * parameters and once with the edited ones, so the difference it shows is the
 * parameter change alone rather than whatever data arrived since the run.
 */
export async function readImpactData(db: Db): Promise<ImpactData> {
  const { rows } = await db.query<ImpactRow>(
    `select id, project_name, started_at, answers from (
       select distinct on (r.project_id)
              r.id, p.name as project_name, r.started_at, r.answers
         from runs r
         join projects p on p.id = r.project_id
        where r.status = 'succeeded' and r.skill = $1 and r.answers is not null
          and p.archived_at is null
        order by r.project_id, r.started_at desc, r.id desc
     ) newest
     order by started_at desc, id desc
     limit $2`,
    [ROM_SKILL, IMPACT_RUN_LIMIT],
  );

  const runs: ImpactRun[] = [];
  const snapshots: ImpactData["snapshots"] = {};
  const rated = rows.length > 0 ? await readParameterData(db) : null;
  for (const row of rows) {
    if (!row.answers || !rated) continue;
    // A run through the question flow also records the flow itself (LA-20),
    // which the engine does not read.
    const answers: Answers & { flow?: unknown } = { ...row.answers };
    delete answers.flow;
    const withMarkups = Boolean(answers.markups);
    const key = `${answers.projectType}/${answers.constructionKind}/${withMarkups ? "markups" : "trade"}`;
    if (!snapshots[key]) {
      const [data, rules] = await Promise.all([
        readBenchmarkData(db, answers.projectType, answers.constructionKind),
        readApprovedJudgmentRules(db, {
          projectType: answers.projectType,
          constructionKind: answers.constructionKind,
        }),
      ]);
      const snapshot: Partial<DataSnapshot> = assembleSnapshot(data, rated, rules, withMarkups);
      delete snapshot.parameters;
      snapshots[key] = snapshot as Omit<DataSnapshot, "parameters">;
    }
    runs.push({
      runId: row.id,
      projectName: row.project_name,
      startedAt: toIso(row.started_at),
      grossSquareFeet: answers.grossSquareFeet,
      answers,
      snapshotKey: key,
    });
  }
  return { runs, snapshots };
}
