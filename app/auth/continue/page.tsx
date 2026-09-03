import Link from "next/link";

import { safeAuthEmailType, safeAuthTokenHash, safeReturnPath } from "@/lib/auth/policy";
import { confirmAuthLink } from "./actions";

export const dynamic = "force-dynamic";

export default async function ContinueAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; token_hash?: string; type?: string }>;
}) {
  const params = await searchParams;
  const tokenHash = safeAuthTokenHash(params.token_hash);
  const type = safeAuthEmailType(params.type);
  const next = safeReturnPath(params.next);
  const invalid = params.error === "invalid" || !tokenHash || !type;

  return (
    <div className="login">
      <div className="login-column">
        <div className="login-mark">Kulka<span className="logo-ai">AI</span></div>
        <h1>{type === "recovery" ? "Reset Your Password" : "Finish Account Setup"}</h1>
        {invalid ? (
          <>
            <p className="t-meta sub" role="alert">This account link is invalid or has expired.</p>
            <p className="login-foot">
              <Link className="login-link" href="/forgot-password">Request a New Link</Link>
            </p>
          </>
        ) : (
          <>
            <p className="t-meta sub">
              {type === "recovery"
                ? "Continue to choose a new password for Kulka AI."
                : "Confirm that you want to continue to Kulka AI."}
            </p>
            <form action={confirmAuthLink}>
              <input name="token_hash" type="hidden" value={tokenHash} />
              <input name="type" type="hidden" value={type} />
              <input name="next" type="hidden" value={next} />
              <div className="login-actions">
                <button className="btn btn--primary btn--lg" type="submit">Continue</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
