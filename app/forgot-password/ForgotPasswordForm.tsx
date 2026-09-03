"use client";

import { useActionState } from "react";

import { requestPasswordReset, type RecoveryState } from "./actions";

const initialState: RecoveryState = { error: null, message: null };

export function ForgotPasswordForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(requestPasswordReset, initialState);
  return (
    <form action={action}>
      <input name="next" type="hidden" value={next} />
      <div className="login-field">
        <label className="t-label field-label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {state.error ? <p className="t-meta" role="alert">{state.error}</p> : null}
      {state.message ? <p className="t-meta" role="status">{state.message}</p> : null}
      <div className="login-actions">
        <button className="btn btn--primary btn--lg" type="submit" disabled={pending}>
          {pending ? "Sending..." : "Send Reset Link"}
        </button>
      </div>
    </form>
  );
}
