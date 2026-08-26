// The login cover: the one screen without the app frame.
export default function Login() {
  return (
    <div className="login">
      <div className="login-column">
        <div className="login-mark">
          Kulka<span className="logo-ai">AI</span>
        </div>
        <h1>Sign in</h1>
        <p className="t-meta sub">The Kulka Group workspace</p>

        <div className="login-field">
          <label className="t-label field-label" htmlFor="email">Email</label>
          <input className="input" id="email" type="email" autoComplete="email" placeholder="you@kulkagroup.com" />
        </div>
        <div className="login-field">
          <label className="t-label field-label" htmlFor="password">Password</label>
          <input className="input" id="password" type="password" autoComplete="current-password" />
        </div>

        <div className="login-actions">
          <button className="btn btn--primary btn--lg" type="button">Sign in</button>
        </div>

        <p className="t-meta login-foot">
          <button className="btn btn--quiet" type="button">Forgot password?</button>
        </p>
      </div>
    </div>
  );
}
