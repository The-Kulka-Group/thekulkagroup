"use client";

import { useEffect, useState } from "react";

import { readerRows, type ListedReader, type ReaderRow } from "./reader-model";

// LA-1486 (spec docs/precon/client-comments-spec.md, Decision 1). The readers
// section of the Publish panel. The estimator adds a person (name, email,
// company) whenever they like, copies that person's own link, and revokes it
// behind a confirm step. It is not a step in every publish. A reader's link
// opens the newest open version and names them on whatever they post. The
// list never prints the link or the email, only the name and company, so
// neither shows on screen.

export type ReaderFields = { name: string; email: string; company: string };

export const EMPTY_READER: ReaderFields = { name: "", email: "", company: "" };

/** A reader needs a name and an email with an @ in it. */
export function canAddReader(fields: ReaderFields): boolean {
  return fields.name.trim() !== "" && /^[^@\s]+@[^@\s]+$/.test(fields.email.trim());
}

export function ReaderForm({
  fields,
  busy,
  error,
  onChange,
  onSubmit,
}: {
  fields: ReaderFields;
  busy: boolean;
  error: string | null;
  onChange: (patch: Partial<ReaderFields>) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="pb-form"
      aria-label="Add a Reader"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && canAddReader(fields)) onSubmit();
      }}
    >
      <div className="pb-fields">
        <label>
          <span className="field-label t-label">Name</span>
          <input
            className="input"
            value={fields.name}
            disabled={busy}
            required
            autoComplete="off"
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </label>
        <label>
          <span className="field-label t-label">Email</span>
          <input
            className="input"
            type="email"
            value={fields.email}
            disabled={busy}
            required
            autoComplete="off"
            onChange={(event) => onChange({ email: event.target.value })}
          />
        </label>
        <label>
          <span className="field-label t-label">Company</span>
          <input
            className="input"
            value={fields.company}
            disabled={busy}
            autoComplete="off"
            onChange={(event) => onChange({ company: event.target.value })}
          />
        </label>
      </div>
      {error ? (
        <p className="rb-pp rb-pp--error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="rb-acts">
        <button type="submit" className="btn" disabled={busy || !canAddReader(fields)}>
          {busy ? "Adding" : "Add a Reader"}
        </button>
      </div>
    </form>
  );
}

export function ReaderList({
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
  rows: ReaderRow[];
  copiedId: string | null;
  confirmingId: string | null;
  busyId: string | null;
  error: string | null;
  onCopy: (row: ReaderRow) => void;
  onAskRevoke: (id: string) => void;
  onCancel: () => void;
  onRevoke: (row: ReaderRow) => void;
}) {
  return (
    <div>
      {error ? (
        <p className="rb-pp rb-pp--error" role="alert">
          {error}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="pb-none">No readers are added to this project yet.</p>
      ) : (
        <ol className="pb-list">
          {rows.map((row) => {
            const confirming = confirmingId === row.id;
            const busy = busyId === row.id;
            const revoked = row.revokedOn !== null;
            return (
              <li key={row.id} className="pb-row" data-reader={row.id} data-state={revoked ? "revoked" : "active"}>
                <div className="pb-top">
                  <span className="pb-ver">{row.name}</span>
                  {row.company ? <span className="pb-when">{row.company}</span> : null}
                  <span className="pb-state">
                    <span className={`rb-dot ${revoked ? "rb-dot--stuck" : "rb-dot--high"}`} aria-hidden="true" />
                    {revoked ? `Revoked on ${row.revokedOn}` : "Active"}
                  </span>
                </div>
                {revoked ? (
                  <p className="pb-link">The link no longer opens the budget.</p>
                ) : (
                  <div className="rb-acts">
                    {confirming ? (
                      <>
                        <span className="rb-pp">Revoke the link for {row.name}? It stops opening on the next visit.</span>
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
                          {copiedId === row.id ? "Copied" : "Copy Reader Link"}
                        </button>
                        <button type="button" className="btn btn--redline" onClick={() => onAskRevoke(row.id)}>
                          Revoke Link
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
    </div>
  );
}

async function errorFrom(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => ({}));
  return typeof body.error === "string" ? body.error : fallback;
}

async function readReaders(projectId: string): Promise<{ readers: ListedReader[] } | { error: string }> {
  try {
    const response = await fetch(`/api/rom/projects/${encodeURIComponent(projectId)}/readers`);
    if (!response.ok) return { error: await errorFrom(response, "The readers could not be read.") };
    const body = await response.json();
    return { readers: body.readers as ListedReader[] };
  } catch {
    return { error: "The readers could not be read. Check the connection and try again." };
  }
}

export function ReadersSection({ projectId }: { projectId: string }) {
  const [fields, setFields] = useState<ReaderFields>(EMPTY_READER);
  const [readers, setReaders] = useState<ListedReader[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const apply = (read: { readers: ListedReader[] } | { error: string }) => {
    if ("error" in read) {
      setListError(read.error);
      return;
    }
    setReaders(read.readers);
    setListError(null);
  };
  const load = async () => apply(await readReaders(projectId));

  useEffect(() => {
    let current = true;
    void readReaders(projectId).then((read) => {
      if (current) apply(read);
    });
    return () => {
      current = false;
    };
  }, [projectId]);

  async function add() {
    setBusy(true);
    setFormError(null);
    setNotice("");
    try {
      const response = await fetch(`/api/rom/projects/${encodeURIComponent(projectId)}/readers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!response.ok) {
        setFormError(await errorFrom(response, "The reader could not be added."));
        return;
      }
      const { reader } = (await response.json()) as { reader: ListedReader };
      setFields(EMPTY_READER);
      setNotice(`${reader.name} is added. Copy their link from the list below.`);
      await load();
    } catch {
      setFormError("The reader could not be added. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(row: ReaderRow) {
    try {
      if (row.link === null) throw new Error("No link");
      await navigator.clipboard.writeText(row.link);
      setCopiedId(row.id);
      window.setTimeout(() => setCopiedId((now) => (now === row.id ? null : now)), 2000);
    } catch {
      setListError("The link could not be copied. Try again.");
    }
  }

  async function revoke(row: ReaderRow) {
    setBusyId(row.id);
    setListError(null);
    try {
      const response = await fetch(`/api/rom/readers/${encodeURIComponent(row.id)}/revoke`, { method: "POST" });
      if (!response.ok) {
        setListError(await errorFrom(response, "The link could not be revoked."));
        return;
      }
      setConfirmingId(null);
      setNotice(`The link for ${row.name} is revoked.`);
      await load();
    } catch {
      setListError("The link could not be revoked. Check the connection and try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-label="Readers">
      <h3 className="pb-list-head">Readers</h3>
      <p className="pb-hint">
        Each reader gets a personal link. It opens the newest version and names them on anything they post.
      </p>
      <ReaderForm
        fields={fields}
        busy={busy}
        error={formError}
        onChange={(patch) => setFields((now) => ({ ...now, ...patch }))}
        onSubmit={() => void add()}
      />
      <p className="nb-save" role="status">
        {notice}
      </p>
      <ReaderList
        rows={readerRows(readers ?? [])}
        copiedId={copiedId}
        confirmingId={confirmingId}
        busyId={busyId}
        error={listError}
        onCopy={(row) => void copy(row)}
        onAskRevoke={setConfirmingId}
        onCancel={() => setConfirmingId(null)}
        onRevoke={(row) => void revoke(row)}
      />
    </section>
  );
}
