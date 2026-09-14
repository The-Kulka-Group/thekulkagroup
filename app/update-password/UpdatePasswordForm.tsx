"use client";

import { useActionState } from "react";

import { updatePassword, type PasswordState } from "./actions";

const initialState: PasswordState = { error: null };

export function UpdatePasswordForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(updatePassword, initialState);
  return (
    <form className="auth-form" action={action}>
      <input name="next" type="hidden" value={next} />
      <div className="auth-field">
        <label className="t-label field-label" htmlFor="password">New Password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} aria-invalid={state.error ? true : undefined} aria-describedby="password-help" required />
      </div>
      <div className="auth-field">
        <label className="t-label field-label" htmlFor="confirmation">Confirm Password</label>
        <input className="input" id="confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} aria-invalid={state.error ? true : undefined} aria-describedby="password-help" required />
      </div>
      <p className="auth-help" id="password-help">Use at least 12 characters. A password manager is recommended.</p>
      {state.error ? <p className="auth-message auth-message--error" role="alert">{state.error}</p> : null}
      <div className="auth-actions">
        <button className="btn btn--primary btn--lg" type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save Password"}
        </button>
      </div>
    </form>
  );
}
