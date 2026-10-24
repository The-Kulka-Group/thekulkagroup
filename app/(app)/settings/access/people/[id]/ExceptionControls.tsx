"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import type { TargetKind } from "@/lib/access/level";

import { addExceptionAction, removeExceptionAction } from "../../actions";

// LA-3046. Add Exception stays folded until asked for (Rob's simple-first
// rule); Remove asks once before it takes an exception away.

export function AddException({ personId, targets }: { personId: string; targets: readonly { value: string; label: string }[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(addExceptionAction, null);
  const details = useRef<HTMLDetailsElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state?.ok) return;
    form.current?.reset();
    if (details.current) details.current.open = false;
    router.refresh();
  }, [state, router]);

  return (
    <details ref={details} className="ac-fold" style={{ borderTop: "1px solid var(--border-light)", paddingTop: "var(--s3)" }}>
      <summary><span className="btn btn--secondary">Add Exception</span></summary>
      <form ref={form} className="ac-form" action={action} style={{ padding: "var(--s3) 0 0" }}>
        <input type="hidden" name="personId" value={personId} />
        <div className="ac-form-grid">
          <label className="ac-wide">
            Tool or Department
            <select className="input" name="target" defaultValue="" required>
              <option value="" disabled>Pick one</option>
              {targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label>
            Level
            <select className="input" name="level" defaultValue="view" required>
              <option value="hidden">Hidden</option>
              <option value="view">View</option>
              <option value="edit">Edit</option>
            </select>
          </label>
          <label>End Date<input className="input" type="date" name="endsOn" /></label>
          <label className="ac-wide">Reason<input className="input" name="reason" placeholder="Covers C00466 while its project manager is out" required /></label>
        </div>
        <div className="ac-form-actions">
          {state && !state.ok ? <span className="ac-error" role="alert">{state.error}</span> : null}
          <button className="btn btn--primary btn--lg" type="submit" disabled={pending}>{pending ? "Saving" : "Add Exception"}</button>
        </div>
      </form>
    </details>
  );
}

export function RemoveException({ personId, targetKind, targetKey, label }: { personId: string; targetKind: TargetKind; targetKey: string; label: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!asking) {
    return <button type="button" className="btn btn--quiet" onClick={() => setAsking(true)} aria-label={`Remove the ${label} exception`}>Remove</button>;
  }
  return (
    <span className="ac-form-actions">
      {error ? <span className="ac-error" role="alert">{error}</span> : null}
      <button type="button" className="btn btn--secondary" onClick={() => setAsking(false)} disabled={pending}>Keep</button>
      <button
        type="button"
        className="btn btn--redline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await removeExceptionAction(personId, targetKind, targetKey);
            if (!result.ok) setError(result.error);
            else router.refresh();
          })
        }
      >
        Remove Exception
      </button>
    </span>
  );
}
