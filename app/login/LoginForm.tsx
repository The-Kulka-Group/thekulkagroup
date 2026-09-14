"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signIn, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, initialState);
  return (
    <form className="auth-form" action={action}>
      <input name="next" type="hidden" value={next} />
      <div className="auth-field">
        <label className="t-label field-label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" aria-invalid={state.error ? true : undefined} required />
      </div>
      <div className="auth-field">
        <div className="auth-label-row">
          <label className="t-label field-label" htmlFor="password">Password</label>
          <Link className="auth-link" href={`/forgot-password?next=${encodeURIComponent(next)}`}>Forgot password?</Link>
        </div>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" aria-invalid={state.error ? true : undefined} required />
      </div>
      {state.error ? <p className="auth-message auth-message--error" role="alert">{state.error}</p> : null}
      <div className="auth-actions">
        <button className="btn btn--primary btn--lg" type="submit" disabled={pending}>
          {pending ? "Signing In..." : "Sign In"}
        </button>
      </div>
    </form>
  );
}
