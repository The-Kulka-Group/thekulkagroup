"use client";

import { useActionState } from "react";

import { signIn, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, initialState);
  return (
    <form action={action}>
      <input name="next" type="hidden" value={next} />
      <div className="login-field">
        <label className="t-label field-label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="login-field">
        <label className="t-label field-label" htmlFor="password">Password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error ? <p className="t-meta" role="alert">{state.error}</p> : null}
      <div className="login-actions">
        <button className="btn btn--primary btn--lg" type="submit" disabled={pending}>
          {pending ? "Signing In..." : "Sign In"}
        </button>
      </div>
    </form>
  );
}
