import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
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
    <AuthShell
      title="Reset Password"
      description="Enter your approved work email."
      footer={<Link className="auth-link" href={`/login?next=${encodeURIComponent(next)}`}>Back to Sign In</Link>}
    >
      <ForgotPasswordForm next={next} />
    </AuthShell>
  );
}
