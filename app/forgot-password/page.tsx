import Link from "next/link";

import { safeReturnPath } from "@/lib/auth/policy";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeReturnPath((await searchParams).next);

  return (
    <div className="login">
      <div className="login-column">
        <div className="login-mark">Kulka<span className="logo-ai">AI</span></div>
        <h1>Reset Password</h1>
        <p className="t-meta sub">Enter your approved work email.</p>
        <ForgotPasswordForm next={next} />
        <p className="login-foot">
          <Link className="login-link" href={`/login?next=${encodeURIComponent(next)}`}>Back to Sign In</Link>
        </p>
      </div>
    </div>
  );
}
