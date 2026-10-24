"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { GoArrow } from "@/components/ButtonMarks";
import type { Role } from "@/lib/access/read";

import { addPersonAction } from "./actions";

// LA-3046, canvas board 2's Add Person. Folded until asked for. No invite goes
// out while sign-in is off; the new person's page opens so exceptions can be
// added there.

export function AddPerson({ roles }: { roles: readonly Role[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(addPersonAction, null);
  useEffect(() => {
    if (state?.ok && state.id) router.push(`/settings/access/people/${state.id}`);
  }, [state, router]);

  return (
    <details className="ac-card ac-fold">
      <summary className="ac-form-actions" style={{ justifyContent: "space-between", padding: "var(--s3) var(--s4)" }}>
        <span className="ac-note">Add someone by name, email, title and role.</span>
        <span className="btn btn--go">Add Person<GoArrow /></span>
      </summary>
      <form className="ac-form" action={action} style={{ borderTop: "1px solid var(--border-light)" }}>
        <div className="ac-form-grid">
          <label className="ac-wide">Name<input className="input" name="name" autoComplete="off" required /></label>
          <label>Email<input className="input" name="email" type="email" placeholder="name@thekulkagroup.com" autoComplete="off" required /></label>
          <label>Title<input className="input" name="title" placeholder="Project Manager" autoComplete="off" /></label>
          <label className="ac-wide">
            Role
            <select className="input" name="role" defaultValue="" required>
              <option value="" disabled>Pick a role</option>
              {roles.map((r) => (
                <option key={r.key} value={r.key}>{r.name}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="ac-note">No invite goes out while sign-in is off. You can add exceptions on their page after.</p>
        <div className="ac-form-actions">
          {state && !state.ok ? <span className="ac-error" role="alert">{state.error}</span> : null}
          <button className="btn btn--primary btn--lg" type="submit" disabled={pending}>
            {pending ? "Adding" : "Add Person"}
          </button>
        </div>
      </form>
    </details>
  );
}
