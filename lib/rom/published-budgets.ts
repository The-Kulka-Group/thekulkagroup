import { randomBytes } from "node:crypto";

import type { Rom } from "@kulka/engine";

import { siteUrlFrom } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { listDerivedAssumptions } from "@/lib/rom/derived-assumptions";
import { issueRom } from "@/lib/rom/issue";
import { getRun } from "@/lib/rom/run-records";

import { toIso } from "./date";
import {
  assembleSnapshot,
  type PresentationCopy,
  type PublishedBudgetSnapshot,
  type PublishedStage,
} from "./published-snapshot";

// LA-1417. A run becomes a published budget (spec LA-1309). Publishing issues
// the run (lib/rom/issue.ts keeps the first issue stamp), freezes a complete
// snapshot, and adds a row with its own token and the project's next version
// number. The published page reads only `published_budgets`, through
// `loadPublishedBudget`, so it never touches `runs` or the engine.
//
// Rows are frozen by a trigger (20260930010000_published_budgets.sql). The
// writes here after insert are the three write-once columns: `revoked_at`,
// `superseded_by` and, later, `pdf_path`.

/** 16 random bytes as unpadded base64url: 22 URL-safe characters. */
export function newToken(): string {
  return randomBytes(16).toString("base64url");
}

const TOKEN = /^[A-Za-z0-9_-]{22}$/;

/** True when `value` has a token's shape. Anything else is unknown without asking the database. */
export function isToken(value: string): boolean {
  return TOKEN.test(value);
}

export class PublishedBudgetNotFound extends Error {
  constructor(readonly publishedBudgetId: string) {
    super(`No published budget ${publishedBudgetId}.`);
    this.name = "PublishedBudgetNotFound";
  }
}

export type PublishedBudgetRecord = {
  id: string;
  token: string;
  runId: string;
  projectId: string;
  version: number;
  stage: PublishedStage;
  pdfPath: string | null;
  issuedAt: string;
  issuedBy: string;
  revokedAt: string | null;
  supersededBy: string | null;
};

type Row = {
  id: string;
  token: string;
  run_id: string;
  project_id: string;
  version: number | string;
  stage: PublishedStage;
  pdf_path: string | null;
  issued_at: Date | string;
  issued_by: string;
  revoked_at: Date | string | null;
  superseded_by: string | null;
};

const COLUMNS = `id, token, run_id, project_id, version, stage, pdf_path, issued_at, issued_by, revoked_at, superseded_by`;

function fromRow(row: Row): PublishedBudgetRecord {
  return {
    id: row.id,
    token: row.token,
    runId: row.run_id,
    projectId: row.project_id,
    version: Number(row.version),
    stage: row.stage,
    pdfPath: row.pdf_path,
    issuedAt: toIso(row.issued_at),
    issuedBy: row.issued_by,
    revokedAt: row.revoked_at === null ? null : toIso(row.revoked_at),
    supersededBy: row.superseded_by,
  };
}

/**
 * What a version's link shows, the one rule the version list and the page
 * itself follow: withdrawn once revoked, superseded while a later version is
 * still open, current otherwise. A reader of Version 1 is never sent to a
 * withdrawn Version 2, so when every later version is withdrawn the older
 * one reads as current again.
 */
export type VersionState = "current" | "superseded" | "withdrawn";

export function versionState(version: { revoked: boolean; newerOpen: boolean }): VersionState {
  if (version.revoked) return "withdrawn";
  return version.newerOpen ? "superseded" : "current";
}

/** A version as the saved budget's list shows it, with the state its link shows. */
export type ListedPublishedBudget = PublishedBudgetRecord & { state: VersionState };

/**
 * The address a client's link starts with: KULKA_SITE_URL when it is set to
 * a safe https origin, else the address the request came in on.
 */
export function linkOrigin(requestUrl: string, siteUrl: string | undefined = process.env.KULKA_SITE_URL): string {
  return siteUrlFrom(siteUrl) ?? new URL(requestUrl).origin;
}

export type PublishRequest = {
  runId: string;
  /** Who published it: the signed-in user's email. */
  issuedBy: string;
  copy: PresentationCopy;
  stage?: PublishedStage;
};

/** A new version and the snapshot it froze, so the caller can print it without reading the row back. */
export type PublishedBudget = PublishedBudgetRecord & { snapshot: PublishedBudgetSnapshot };

/**
 * Publishes a succeeded run as the project's next version. Each call makes a
 * new row and token, even for the same run, and marks every earlier version
 * of the project that is not yet superseded as superseded by this one.
 * Throws issue.ts's RunNotFound or RunNotSucceeded for a run that cannot be
 * issued.
 */
export async function publishBudget(db: Db, request: PublishRequest): Promise<PublishedBudget> {
  const issuedBy = request.issuedBy.trim();
  if (!issuedBy) throw new Error("A published budget needs the name of whoever published it.");
  const copy = cleanCopy(request.copy);

  return db.withTransaction(async (tx) => {
    const { issuedAt } = await issueRom(tx, request.runId);
    const run = await getRun(tx, request.runId);
    // issueRom only passes a succeeded run, and a succeeded run has a ROM.
    if (!run.rom) throw new Error(`Run ${run.id} has no ROM to publish.`);
    const criteria = await listDerivedAssumptions(tx, run.projectId);
    const sourceJobNames = await jobNamesFor(tx, run.rom);
    const snapshot = assembleSnapshot({ run: { ...run, rom: run.rom }, issuedAt, criteria, copy, sourceJobNames });

    // One publish per project at a time, so two cannot claim one version.
    await tx.query(`select id from projects where id = $1 for update`, [run.projectId]);
    const { rows: next } = await tx.query<{ version: number | string }>(
      `select coalesce(max(version), 0) + 1 as version from published_budgets where project_id = $1`,
      [run.projectId],
    );

    const { rows } = await tx.query<Row>(
      `insert into published_budgets (token, run_id, project_id, version, stage, snapshot, issued_by)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7)
       returning ${COLUMNS}`,
      [newToken(), run.id, run.projectId, Number(next[0].version), request.stage ?? "conceptual", JSON.stringify(snapshot), issuedBy],
    );
    const published = rows[0];

    await tx.query(
      `update published_budgets set superseded_by = $1
        where project_id = $2 and id <> $1 and superseded_by is null`,
      [published.id, run.projectId],
    );
    return { ...fromRow(published), snapshot };
  });
}

/** The name of every job the run's comparables cite, as the projects table holds it now. */
async function jobNamesFor(tx: Db, rom: Rom): Promise<Record<string, string>> {
  const ids = [...new Set(rom.lines.flatMap((line) => line.comparables.flatMap((c) => c.sourceProjectIds)))];
  if (ids.length === 0) return {};
  const { rows } = await tx.query<{ id: string; name: string }>(
    `select id::text as id, name from projects where id::text = any($1::text[])`,
    [ids],
  );
  return Object.fromEntries(rows.map((row) => [row.id, row.name]));
}

/** Withdraws a link. A second call keeps the first withdrawal time. */
export async function revokePublishedBudget(db: Db, id: string): Promise<PublishedBudgetRecord> {
  const { rows } = await db.query<Row>(
    `update published_budgets set revoked_at = coalesce(revoked_at, now())
      where id = $1 returning ${COLUMNS}`,
    [id],
  );
  if (!rows[0]) throw new PublishedBudgetNotFound(id);
  return fromRow(rows[0]);
}

/** Every version published for a project, newest first, each with the state its link shows. */
export async function listPublishedBudgets(db: Db, projectId: string): Promise<ListedPublishedBudget[]> {
  const { rows } = await db.query<Row>(
    `select ${COLUMNS} from published_budgets where project_id = $1 order by version desc`,
    [projectId],
  );
  const records = rows.map(fromRow);
  return records.map((record) => ({
    ...record,
    state: versionState({
      revoked: record.revokedAt !== null,
      newerOpen: records.some((other) => other.version > record.version && other.revokedAt === null),
    }),
  }));
}

/** A newer version a superseded page names and links to. */
export type NewerVersion = { version: number; token: string; issuedAt: string };

export type PublishedBudgetView =
  | {
      state: "current" | "superseded";
      token: string;
      version: number;
      stage: PublishedStage;
      issuedAt: string;
      snapshot: PublishedBudgetSnapshot;
      /** The newest version still open, for a superseded page. Null on a current one. */
      newer: NewerVersion | null;
    }
  | {
      state: "withdrawn";
      version: number;
      /** Whom to ask, from the copy the estimator wrote. The withdrawn sheet shows no figures. */
      preparedBy: string | null;
    };

type ViewRow = Row & {
  snapshot: PublishedBudgetSnapshot;
  newer_version: number | string | null;
  newer_token: string | null;
  newer_issued_at: Date | string | null;
};

/**
 * What `/b/<token>` renders, read from `published_budgets` alone. Null for a
 * token that is malformed or unknown, which the route answers with a plain
 * 404.
 *
 * Judgment call: a superseded page names the newest version of the project
 * that is not withdrawn, rather than whatever `superseded_by` points at, so a
 * reader of Version 1 is sent to Version 3 rather than to Version 2's
 * withdrawn sheet. When every later version is withdrawn, the page reads as
 * current, since there is nothing newer to send the reader to.
 */
export async function loadPublishedBudget(db: Db, token: string): Promise<PublishedBudgetView | null> {
  if (!isToken(token)) return null;
  const { rows } = await db.query<ViewRow>(
    `select b.*,
            n.version as newer_version, n.token as newer_token, n.issued_at as newer_issued_at
       from published_budgets b
       left join lateral (
         select version, token, issued_at from published_budgets later
          where later.project_id = b.project_id and later.version > b.version and later.revoked_at is null
          order by later.version desc limit 1
       ) n on true
      where b.token = $1`,
    [token],
  );
  const row = rows[0];
  if (!row) return null;
  const newer: NewerVersion | null =
    row.newer_token && row.newer_version !== null && row.newer_issued_at !== null
      ? { version: Number(row.newer_version), token: row.newer_token, issuedAt: toIso(row.newer_issued_at) }
      : null;
  const state = versionState({ revoked: row.revoked_at !== null, newerOpen: newer !== null });
  if (state === "withdrawn") {
    return { state, version: Number(row.version), preparedBy: row.snapshot.copy?.preparedBy ?? null };
  }
  return {
    state,
    token: row.token,
    version: Number(row.version),
    stage: row.stage,
    issuedAt: toIso(row.issued_at),
    snapshot: row.snapshot,
    newer,
  };
}

/** Where a published budget's stored PDF lives, if it has one and the link is open. */
export async function publishedPdfPath(db: Db, token: string): Promise<string | null> {
  if (!isToken(token)) return null;
  const { rows } = await db.query<{ pdf_path: string | null }>(
    `select pdf_path from published_budgets where token = $1 and revoked_at is null`,
    [token],
  );
  return rows[0]?.pdf_path ?? null;
}

function cleanCopy(copy: PresentationCopy): PresentationCopy {
  const text = (value: string | null) => {
    const trimmed = value?.trim() ?? "";
    return trimmed ? trimmed : null;
  };
  const days = copy.validityDays;
  if (days !== null && !(Number.isInteger(days) && days > 0)) {
    throw new Error("Figures valid for must be a whole number of days above zero.");
  }
  return {
    preparedFor: text(copy.preparedFor),
    preparedBy: text(copy.preparedBy),
    validityDays: days,
    coverSentence: text(copy.coverSentence),
  };
}
