import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
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
  const title = type === "recovery" ? "Reset Your Password" : "Finish Account Setup";

  if (invalid) {
    return (
      <AuthShell
        title={title}
        description="This account link is invalid or has expired."
        descriptionRole="alert"
        footer={<Link className="auth-link" href="/forgot-password">Request a New Link</Link>}
      />
    );
  }

  return (
    <AuthShell
      title={title}
      description={type === "recovery"
        ? "Continue to choose a new password for Kulka AI."
        : "Confirm that you want to continue to Kulka AI."}
    >
      <form className="auth-form" action={confirmAuthLink}>
        <input name="token_hash" type="hidden" value={tokenHash} />
        <input name="type" type="hidden" value={type} />
        <input name="next" type="hidden" value={next} />
        <div className="auth-actions auth-actions--flush">
          <button className="btn btn--primary btn--lg" type="submit">Continue</button>
        </div>
      </form>
    </AuthShell>
  );
}
