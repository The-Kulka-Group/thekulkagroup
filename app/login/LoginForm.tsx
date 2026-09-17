"use client";

import { useActionState } from "react";

import { signIn, type LoginState } from "./actions";

const initialState: LoginState = { error: null, message: null };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, initialState);
  return (
    <form className="auth-form" action={action}>
      <input name="next" type="hidden" value={next} />
      <div className="auth-field">
        <label className="t-label field-label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" aria-invalid={state.error ? true : undefined} required />
      </div>
      {state.error ? <p className="auth-message auth-message--error" role="alert">{state.error}</p> : null}
      {state.message ? <p className="auth-message auth-message--status" role="status">{state.message}</p> : null}
      <div className="auth-actions">
        <button className="btn btn--primary btn--lg" type="submit" disabled={pending}>
          {pending ? "Sending..." : "Send Sign-In Link"}
        </button>
      </div>
    </form>
  );
}
