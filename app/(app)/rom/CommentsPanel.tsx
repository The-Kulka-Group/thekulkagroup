"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useReplyAs } from "@/components/reply-as";
import type { PanelMessage, PanelThread, PanelVersion, ProjectComments } from "@/lib/rom/budget-comment-inbox";
import { MAX_BODY_CHARACTERS } from "@/lib/rom/budget-comments";

import { KIND_WORDS, markersOf, offersOf, readerWords, stateDot, stateWords, whenWords } from "./comments-model";
import "./comments.css";

// LA-1490 (spec Decisions 3 and 4). Client Comments on a saved budget: every
// thread on the project, grouped by version, with Reply, Internal Note, Close
// and Remove, and Accept for Next Version and Decline on a flag. The page a
// client reads is app/b/[token]; this panel is Kulka's side. Anyone using the
// app may act, because sign-in is off, and "Reply As" is the name the client
// reads and the record of who acted.

/** What a thread is doing right now: a form open on it, or a step waiting for a yes. */
export type ActiveAction =
  | { mode: "reply" | "note" | "decline" | "close" | "accept" | "remove-correction" }
  | { mode: "remove-message"; messageId: string };

const COMPOSER_PROMPT = {
  reply: { label: "Reply to the Client", submit: "Send Reply", busy: "Sending" },
  note: { label: "Internal Note", submit: "Save Note", busy: "Saving" },
  decline: { label: "Reply to the Client", submit: "Decline and Reply", busy: "Declining" },
} as const;

const CONFIRM_WORDS = {
  close: { ask: "Close this thread? A closed thread takes no more messages.", go: "Confirm Close", busy: "Closing" },
  accept: {
    ask: "Accept this flag for the next version? The budget does not change. The estimator edits the fact and publishes a new version.",
    go: "Confirm Accept",
    busy: "Accepting",
  },
  "remove-correction": {
    ask: "Remove What It Should Be for good? The row stays and the words do not.",
    go: "Confirm Remove",
    busy: "Removing",
  },
  "remove-message": {
    ask: "Remove this message for good? The row stays and the words do not.",
    go: "Confirm Remove",
    busy: "Removing",
  },
} as const;

function Message({ message, onRemove }: { message: PanelMessage; onRemove: (id: string) => void }) {
  const internal = message.visibility === "internal";
  return (
    <li className={`cc-msg${internal ? " cc-msg--internal" : ""}`} data-author={message.authorKind} data-visibility={message.visibility}>
      <div className="cc-msg-top">
        <span className="cc-msg-who">
          {message.author}
          {message.company ? `, ${message.company}` : ""}
        </span>
        <span className="cc-when num">{whenWords(message.createdAt)}</span>
        {internal ? <span className="cc-mark">Internal Note</span> : null}
        {message.visibility === "draft" ? <span className="cc-mark">Unreleased Draft</span> : null}
        {message.hidden ? <span className="cc-mark">Hidden From the Client</span> : null}
      </div>
      {message.removed ? (
        <p className="cc-msg-body cc-removed">Removed at the Writer&rsquo;s Request</p>
      ) : (
        <>
          <p className="cc-msg-body">{message.body}</p>
          <button type="button" className="btn btn--redline cc-msg-remove" onClick={() => onRemove(message.id)}>
            Remove
          </button>
        </>
      )}
    </li>
  );
}

export function ThreadCard({
  thread,
  active,
  text,
  busy,
  error,
  replyAsMissing,
  onStart,
  onText,
  onSubmit,
  onCancel,
}: {
  thread: PanelThread;
  /** The form or step open on this thread, or null. */
  active: ActiveAction | null;
  text: string;
  busy: boolean;
  error: string | null;
  /** Reply As is empty, so nothing that signs a reply can be sent. */
  replyAsMissing: boolean;
  onStart: (action: ActiveAction) => void;
  onText: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const offers = offersOf(thread);
  const marks = markersOf(thread);
  const mode = active?.mode ?? null;
  const composing = mode === "reply" || mode === "note" || mode === "decline";
  const confirming = mode !== null && !composing ? CONFIRM_WORDS[mode] : null;
  const prompt = composing ? COMPOSER_PROMPT[mode] : null;
  const ready = !replyAsMissing && !busy && (confirming !== null || text.trim() !== "");

  return (
    <li className="cc-thread" data-thread={thread.id} data-kind={thread.kind} data-status={thread.status}>
      <div className="cc-top">
        <span className="cc-label">{thread.label}</span>
        <span className="cc-kind">{KIND_WORDS[thread.kind]}</span>
        <span className="cc-state">
          <span className={`rb-dot ${stateDot(thread)}`} aria-hidden="true" />
          {stateWords(thread)}
        </span>
      </div>
      <p className="cc-by">
        {readerWords(thread.reader)} <span className="cc-when num">{whenWords(thread.openedAt)}</span>
      </p>
      {marks.length > 0 ? (
        <p className="cc-marks">
          {marks.map((mark) => (
            <span key={mark} className="cc-mark cc-mark--warn">
              {mark}
            </span>
          ))}
        </p>
      ) : null}

      {thread.kind === "flag" ? (
        <dl className="cc-flag">
          <div>
            <dt className="t-label">Budget Says</dt>
            <dd>{thread.budgetSays ?? "Nothing shown"}</dd>
          </div>
          <div>
            <dt className="t-label">Owner Says</dt>
            <dd>{thread.proposedRemoved ? "Removed at the Writer’s Request" : thread.proposed}</dd>
          </div>
        </dl>
      ) : thread.budgetSays ? (
        <p className="cc-anchor">{thread.budgetSays}</p>
      ) : null}

      {thread.messages.length > 0 ? (
        <ol className="cc-msgs">
          {thread.messages.map((message) => (
            <Message key={message.id} message={message} onRemove={(messageId) => onStart({ mode: "remove-message", messageId })} />
          ))}
        </ol>
      ) : null}

      {error ? (
        <p className="rb-pp rb-pp--error" role="alert">
          {error}
        </p>
      ) : null}

      {prompt ? (
        <form
          className="cc-compose"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) onSubmit();
          }}
        >
          <label>
            <span className="field-label t-label">{prompt.label}</span>
            <textarea
              className="input"
              rows={3}
              maxLength={MAX_BODY_CHARACTERS}
              value={text}
              disabled={busy}
              onChange={(event) => onText(event.target.value)}
            />
          </label>
          {mode === "note" ? <span className="pb-hint">Only Kulka sees an Internal Note.</span> : null}
          {mode === "decline" ? <span className="pb-hint">The owner reads this reply. It tells them why.</span> : null}
          <div className="rb-acts">
            <button type="button" className="btn" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={!ready}>
              {busy ? prompt.busy : prompt.submit}
            </button>
          </div>
        </form>
      ) : confirming ? (
        <div className="cc-confirm">
          <p className="rb-pp">{confirming.ask}</p>
          <div className="rb-acts">
            <button type="button" className="btn" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="btn btn--redline" disabled={!ready} onClick={onSubmit}>
              {busy ? confirming.busy : confirming.go}
            </button>
          </div>
        </div>
      ) : (
        <div className="rb-acts cc-acts">
          {offers.reply ? (
            <button type="button" className="btn" onClick={() => onStart({ mode: "reply" })}>
              Reply
            </button>
          ) : null}
          {offers.internalNote ? (
            <button type="button" className="btn" onClick={() => onStart({ mode: "note" })}>
              Internal Note
            </button>
          ) : null}
          {offers.accept ? (
            <button type="button" className="btn" onClick={() => onStart({ mode: "accept" })}>
              Accept for Next Version
            </button>
          ) : null}
          {offers.decline ? (
            <button type="button" className="btn" onClick={() => onStart({ mode: "decline" })}>
              Decline
            </button>
          ) : null}
          {offers.close ? (
            <button type="button" className="btn" onClick={() => onStart({ mode: "close" })}>
              Close
            </button>
          ) : null}
          {offers.removeCorrection ? (
            <button type="button" className="btn btn--redline" onClick={() => onStart({ mode: "remove-correction" })}>
              Remove What It Should Be
            </button>
          ) : null}
        </div>
      )}
    </li>
  );
}

export function VersionThreads({
  version,
  card,
}: {
  version: PanelVersion;
  card: (thread: PanelThread) => React.ReactNode;
}) {
  const waiting = version.threads.filter((t) => t.needsKulka).length;
  return (
    <section aria-label={`Version ${version.version}`} className="cc-version">
      <h3 className="pb-list-head">
        Version {version.version}
        <span className="cc-version-state">
          {version.state === "current" ? "Current" : version.state === "superseded" ? "Superseded" : "Withdrawn"}
          {waiting > 0 ? `, ${waiting} Need${waiting === 1 ? "s" : ""} Kulka` : ""}
        </span>
      </h3>
      <ol className="cc-list">{version.threads.map(card)}</ol>
    </section>
  );
}

type Read = { comments: ProjectComments } | { error: string };

async function errorFrom(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => ({}));
  return typeof body.error === "string" ? body.error : fallback;
}

async function readComments(projectId: string): Promise<Read> {
  try {
    const response = await fetch(`/api/rom/projects/${encodeURIComponent(projectId)}/comments`);
    if (!response.ok) return { error: await errorFrom(response, "The client comments could not be read.") };
    return { comments: ((await response.json()) as { comments: ProjectComments }).comments };
  } catch {
    return { error: "The client comments could not be read. Check the connection and try again." };
  }
}

export function CommentsPanel({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [comments, setComments] = useState<ProjectComments | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [replyAs, setReplyAs] = useReplyAs(comments?.defaultReplyAs ?? null);
  const [open, setOpen] = useState<{ threadId: string; action: ActiveAction } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ threadId: string; message: string } | null>(null);

  const apply = (read: Read) => {
    if ("error" in read) {
      setListError(read.error);
      return;
    }
    setComments(read.comments);
    setListError(null);
  };

  useEffect(() => {
    let current = true;
    void readComments(projectId).then((read) => {
      if (current) apply(read);
    });
    return () => {
      current = false;
    };
  }, [projectId]);

  function start(threadId: string, action: ActiveAction) {
    setOpen({ threadId, action });
    setText("");
    setError(null);
  }

  async function submit(thread: PanelThread, action: ActiveAction) {
    const base = `/api/rom/comments/threads/${encodeURIComponent(thread.id)}`;
    let url = `${base}/reply`;
    let payload: Record<string, unknown> = { replyAs };
    switch (action.mode) {
      case "reply":
        payload = { replyAs, body: text };
        break;
      case "note":
        payload = { replyAs, body: text, internal: true };
        break;
      case "decline":
        url = `${base}/decline`;
        payload = { replyAs, reply: text };
        break;
      case "close":
        url = `${base}/close`;
        break;
      case "accept":
        url = `${base}/accept`;
        break;
      case "remove-correction":
        url = `${base}/remove-correction`;
        break;
      case "remove-message":
        url = `/api/rom/comments/messages/${encodeURIComponent(action.messageId)}/remove`;
        break;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setError({ threadId: thread.id, message: await errorFrom(response, "That did not go through.") });
        return;
      }
      setOpen(null);
      setText("");
      apply(await readComments(projectId));
      // Home and the Rail count read the same threads, so they refresh too.
      router.refresh();
    } catch {
      setError({ threadId: thread.id, message: "That did not go through. Check the connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cc-panel">
      <label className="cc-replyas">
        <span className="field-label t-label">Reply As</span>
        <input
          className="input"
          value={replyAs}
          autoComplete="off"
          maxLength={80}
          onChange={(event) => setReplyAs(event.target.value)}
        />
        <span className="pb-hint">The client reads this name on your reply. This browser remembers it.</span>
      </label>
      {listError ? (
        <p className="rb-pp rb-pp--error" role="alert">
          {listError}
        </p>
      ) : null}
      {comments === null && !listError ? <p className="pb-none">Reading the comments.</p> : null}
      {comments && comments.versions.length === 0 ? (
        <p className="pb-none">No client has commented on this budget yet.</p>
      ) : null}
      {comments?.versions.map((version) => (
        <VersionThreads
          key={version.id}
          version={version}
          card={(thread) => (
            <ThreadCard
              key={thread.id}
              thread={thread}
              active={open?.threadId === thread.id ? open.action : null}
              text={text}
              busy={busy && open?.threadId === thread.id}
              error={error?.threadId === thread.id ? error.message : null}
              replyAsMissing={replyAs.trim() === ""}
              onStart={(action) => start(thread.id, action)}
              onText={setText}
              onSubmit={() => open && void submit(thread, open.action)}
              onCancel={() => setOpen(null)}
            />
          )}
        />
      ))}
    </div>
  );
}
