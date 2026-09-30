"use client";

import { useEffect, useState } from "react";

import { DEFAULT_VALIDITY_DAYS, MAX_COVER_SENTENCE } from "@/lib/rom/publish-request";

import { versionList, type ListedVersion, type VersionRow, type VersionState } from "./publish-model";
import "./publish.css";

// LA-1419. Publish on a saved budget (spec LA-1309). The estimator writes
// prepared for, prepared by, the cover sentence and how many days the figures
// stay valid, and publishes the run on screen as the project's next version.
// Below the form, every version with its date and link, a Copy Link on each
// open one, and a Revoke behind a confirm step. Publishing is an action on a
// saved budget, not a run, so nothing here says Generate or Run. The page a
// client opens is rendered by app/b/[token]; this file only controls it.

export type PublishFields = {
  preparedFor: string;
  preparedBy: string;
  coverSentence: string;
  validityDays: string;
};

export const EMPTY_FIELDS: PublishFields = {
  preparedFor: "",
  preparedBy: "",
  coverSentence: "",
  validityDays: String(DEFAULT_VALIDITY_DAYS),
};

/** Prepared for and prepared by are what the client page names, so Publish waits for both. */
export function canPublish(fields: PublishFields): boolean {
  return fields.preparedFor.trim() !== "" && fields.preparedBy.trim() !== "";
}

export function PublishForm({
  fields,
  busy,
  error,
  nextVersion,
  onChange,
  onSubmit,
}: {
  fields: PublishFields;
  busy: boolean;
  error: string | null;
  /** The number the next publish will take, so the button says what it makes. */
  nextVersion: number;
  onChange: (patch: Partial<PublishFields>) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="pb-form"
      aria-label="Publish Budget"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && canPublish(fields)) onSubmit();
      }}
    >
      <div className="pb-fields">
        <label>
          <span className="field-label t-label">Prepared for</span>
          <input
            className="input"
            value={fields.preparedFor}
            disabled={busy}
            required
            autoComplete="off"
            onChange={(event) => onChange({ preparedFor: event.target.value })}
          />
        </label>
        <label>
          <span className="field-label t-label">Prepared by</span>
          <input
            className="input"
            value={fields.preparedBy}
            disabled={busy}
            required
            autoComplete="off"
            onChange={(event) => onChange({ preparedBy: event.target.value })}
          />
        </label>
        <label className="pb-wide">
          <span className="field-label t-label">Cover Sentence</span>
          <textarea
            className="input"
            rows={2}
            maxLength={MAX_COVER_SENTENCE}
            value={fields.coverSentence}
            disabled={busy}
            onChange={(event) => onChange({ coverSentence: event.target.value })}
          />
          <span className="pb-hint">You write this line. It opens the page the client reads.</span>
        </label>
        <label>
          <span className="field-label t-label">Days Valid</span>
          <input
            className="input num"
            inputMode="numeric"
            value={fields.validityDays}
            disabled={busy}
            onChange={(event) => onChange({ validityDays: event.target.value })}
          />
          <span className="pb-hint">Figures stay valid for this many days from issue.</span>
        </label>
      </div>
      {error ? (
        <p className="rb-pp rb-pp--error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="rb-acts">
        <button type="submit" className="btn btn--primary" disabled={busy || !canPublish(fields)}>
          {busy ? "Publishing" : `Publish Version ${nextVersion}`}
        </button>
      </div>
    </form>
  );
}

const STATE_WORDS: Record<VersionState, string> = {
  current: "Current",
  superseded: "Superseded",
  withdrawn: "Withdrawn",
};

const STATE_DOT: Record<VersionState, string> = {
  current: "rb-dot--high",
  superseded: "rb-dot--working",
  withdrawn: "rb-dot--stuck",
};

export function VersionList({
  rows,
  copiedId,
  confirmingId,
  busyId,
  error,
  onCopy,
  onAskRevoke,
  onCancel,
  onRevoke,
}: {
  rows: VersionRow[];
  copiedId: string | null;
  confirmingId: string | null;
  busyId: string | null;
  error: string | null;
  onCopy: (row: VersionRow) => void;
  onAskRevoke: (id: string) => void;
  onCancel: () => void;
  onRevoke: (row: VersionRow) => void;
}) {
  return (
    <section aria-label="Published Versions">
      <h3 className="pb-list-head">Published Versions</h3>
      {error ? (
        <p className="rb-pp rb-pp--error" role="alert">
          {error}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="pb-none">Nothing is published for this budget yet.</p>
      ) : (
        <ol className="pb-list">
          {rows.map((row) => {
            const link = row.link;
            const confirming = confirmingId === row.id;
            const busy = busyId === row.id;
            return (
              <li key={row.id} className="pb-row" data-version={row.version} data-state={row.state}>
                <div className="pb-top">
                  <span className="pb-ver">Version {row.version}</span>
                  <span className="pb-when num">{row.issuedOn}</span>
                  <span className="pb-state">
                    <span className={`rb-dot ${STATE_DOT[row.state]}`} aria-hidden="true" />
                    {STATE_WORDS[row.state]}
                    {row.withdrawnOn ? ` on ${row.withdrawnOn}` : ""}
                  </span>
                </div>
                {row.state === "withdrawn" ? (
                  <p className="pb-link">The link no longer opens the budget.</p>
                ) : (
                  <p className="pb-link">
                    <a href={link} target="_blank" rel="noreferrer">
                      {link}
                    </a>
                  </p>
                )}
                {row.state === "withdrawn" ? null : (
                  <div className="rb-acts">
                    {confirming ? (
                      <>
                        <span className="rb-pp">
                          Revoke Version {row.version}? Its link stops opening and shows a withdrawn notice.
                        </span>
                        <button type="button" className="btn" disabled={busy} onClick={onCancel}>
                          Cancel
                        </button>
                        <button type="button" className="btn btn--redline" disabled={busy} onClick={() => onRevoke(row)}>
                          {busy ? "Revoking" : "Confirm Revoke"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="btn" onClick={() => onCopy(row)}>
                          {copiedId === row.id ? "Copied" : "Copy Link"}
                        </button>
                        <button type="button" className="btn btn--redline" onClick={() => onAskRevoke(row.id)}>
                          Revoke
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

type Read = { records: ListedVersion[] } | { error: string };

async function errorFrom(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => ({}));
  return typeof body.error === "string" ? body.error : fallback;
}

async function readVersions(projectId: string): Promise<Read> {
  try {
    const response = await fetch(`/api/rom/projects/${encodeURIComponent(projectId)}/published`);
    if (!response.ok) return { error: await errorFrom(response, "The published versions could not be read.") };
    const body = await response.json();
    return { records: body.published as ListedVersion[] };
  } catch {
    return { error: "The published versions could not be read. Check the connection and try again." };
  }
}

export function PublishPanel({ projectId, runId }: { projectId: string; runId: string }) {
  const [fields, setFields] = useState<PublishFields>(EMPTY_FIELDS);
  const [records, setRecords] = useState<ListedVersion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const apply = (read: Read) => {
    if ("error" in read) {
      setListError(read.error);
      return;
    }
    setRecords(read.records);
    setListError(null);
  };
  const load = async () => apply(await readVersions(projectId));

  useEffect(() => {
    let current = true;
    void readVersions(projectId).then((read) => {
      if (current) apply(read);
    });
    return () => {
      current = false;
    };
  }, [projectId]);

  const rows = versionList(records ?? []);
  const nextVersion = (rows[0]?.version ?? 0) + 1;

  async function publish() {
    setBusy(true);
    setFormError(null);
    setNotice("");
    try {
      const response = await fetch(`/api/rom/runs/${encodeURIComponent(runId)}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!response.ok) {
        setFormError(await errorFrom(response, "The budget could not be published."));
        return;
      }
      const { published, pdf } = (await response.json()) as { published: Pick<ListedVersion, "version" | "link">; pdf?: { ok: boolean; message?: string } };
      const done = `Version ${published.version} is published. Copy its link from the list below.`;
      setNotice(pdf && !pdf.ok && pdf.message ? `${done} ${pdf.message}` : done);
      setConfirmingId(null);
      await load();
    } catch {
      setFormError("The budget could not be published. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(row: VersionRow) {
    try {
      await navigator.clipboard.writeText(row.link);
      setCopiedId(row.id);
      window.setTimeout(() => setCopiedId((now) => (now === row.id ? null : now)), 2000);
    } catch {
      setListError("The link could not be copied. Select it in the list and copy it by hand.");
    }
  }

  async function revoke(row: VersionRow) {
    setBusyId(row.id);
    setListError(null);
    try {
      const response = await fetch(`/api/rom/published/${encodeURIComponent(row.id)}/revoke`, { method: "POST" });
      if (!response.ok) {
        setListError(await errorFrom(response, "The version could not be revoked."));
        return;
      }
      setConfirmingId(null);
      setNotice(`Version ${row.version} is revoked.`);
      await load();
    } catch {
      setListError("The version could not be revoked. Check the connection and try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PublishForm
        fields={fields}
        busy={busy}
        error={formError}
        nextVersion={nextVersion}
        onChange={(patch) => setFields((now) => ({ ...now, ...patch }))}
        onSubmit={() => void publish()}
      />
      <p className="nb-save" role="status">
        {notice}
      </p>
      <VersionList
        rows={rows}
        copiedId={copiedId}
        confirmingId={confirmingId}
        busyId={busyId}
        error={listError}
        onCopy={(row) => void copy(row)}
        onAskRevoke={setConfirmingId}
        onCancel={() => setConfirmingId(null)}
        onRevoke={(row) => void revoke(row)}
      />
    </div>
  );
}
