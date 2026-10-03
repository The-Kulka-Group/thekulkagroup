"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useReplyAs } from "@/components/reply-as";
import type { NeedsKulka } from "@/lib/rom/budget-comment-inbox";
import { MAX_BODY_CHARACTERS } from "@/lib/rom/budget-comments";

import { whenWords } from "./rom/comments-model";

// LA-1490 (spec Decision 3). Home's list of client comments that need Kulka:
// one sentence and one action each, newest first. Reply opens a form under the
// sentence, so a reply does not need the saved budget open. "Reply As" is the
// name the client reads, and this browser remembers it.

export function HomeThread({
  item,
  replying,
  text,
  replyAs,
  busy,
  error,
  onReply,
  onText,
  onReplyAs,
  onSend,
  onCancel,
}: {
  item: NeedsKulka;
  replying: boolean;
  text: string;
  replyAs: string;
  busy: boolean;
  error: string | null;
  onReply: () => void;
  onText: (value: string) => void;
  onReplyAs: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
}) {
  const ready = !busy && text.trim() !== "" && replyAs.trim() !== "";
  return (
    <li className="hc-item" data-thread={item.threadId}>
      <div className="hc-row">
        <p className="hc-sentence">
          <span className="hc-dot" aria-hidden="true" />
          {item.sentence}
        </p>
        {replying ? null : (
          <button type="button" className="btn btn--secondary" onClick={onReply}>
            Reply
          </button>
        )}
      </div>
      <p className="t-meta hc-meta">
        <Link href={`/rom?project=${encodeURIComponent(item.projectId)}`}>{item.projectName}</Link>{" "}
        <span className="num">{whenWords(item.at)}</span>
      </p>
      {replying ? (
        <form
          className="hc-reply"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) onSend();
          }}
        >
          {item.proposed ? (
            <p className="hc-said">
              <b>What It Should Be:</b> {item.proposed}
              {item.budgetSays ? (
                <>
                  <br />
                  <b>Budget Says:</b> {item.budgetSays}
                </>
              ) : null}
            </p>
          ) : null}
          {item.said ? <p className="hc-said">{item.said}</p> : null}
          <label>
            <span className="field-label t-label">Reply As</span>
            <input
              className="input"
              value={replyAs}
              autoComplete="off"
              maxLength={80}
              onChange={(event) => onReplyAs(event.target.value)}
            />
          </label>
          <label>
            <span className="field-label t-label">Reply to the Client</span>
            <textarea
              className="input"
              rows={3}
              maxLength={MAX_BODY_CHARACTERS}
              value={text}
              disabled={busy}
              onChange={(event) => onText(event.target.value)}
            />
          </label>
          {error ? (
            <p className="hc-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="hc-acts">
            <button type="button" className="btn" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={!ready}>
              {busy ? "Sending" : "Send Reply"}
            </button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

export function HomeThreads({ items }: { items: NeedsKulka[] }) {
  const router = useRouter();
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The version's Prepared By is the default. A name typed here is remembered
  // for every thread in this browser.
  const replying = items.find((item) => item.threadId === replyingId) ?? null;
  const [replyAs, setReplyAs] = useReplyAs(replying?.preparedBy ?? null);

  async function send(item: NeedsKulka) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/rom/comments/threads/${encodeURIComponent(item.threadId)}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ replyAs, body: text }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(typeof body.error === "string" ? body.error : "The reply did not go through.");
        return;
      }
      setReplyingId(null);
      setText("");
      // The thread no longer needs Kulka, so Home and the Rail count reread.
      router.refresh();
    } catch {
      setError("The reply did not go through. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ul className="hc-list" aria-label="Client Comments That Need Kulka">
      {items.map((item) => (
        <HomeThread
          key={item.threadId}
          item={item}
          replying={item.threadId === replyingId}
          text={text}
          replyAs={replyAs}
          busy={busy && item.threadId === replyingId}
          error={item.threadId === replyingId ? error : null}
          onReply={() => {
            setReplyingId(item.threadId);
            setText("");
            setError(null);
          }}
          onText={setText}
          onReplyAs={setReplyAs}
          onSend={() => void send(item)}
          onCancel={() => setReplyingId(null)}
        />
      ))}
    </ul>
  );
}
