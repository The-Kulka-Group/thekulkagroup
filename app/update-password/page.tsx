import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/AuthShell";
import { safeAuthEmailType, safeReturnPath } from "@/lib/auth/policy";
import { authorizeRequest } from "@/lib/auth/server";
import { UpdatePasswordForm } from "./UpdatePasswordForm";

export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string; next?: string }>;
}) {
  const authorization = await authorizeRequest();
  if (!authorization.ok) redirect("/login");
  const params = await searchParams;
  const next = safeReturnPath(params.next);
  const recovery = safeAuthEmailType(params.flow) === "recovery";

  return (
    <AuthShell
      title={recovery ? "Reset Password" : "Create Password"}
      description={recovery
        ? "Choose a new password for Kulka AI."
        : "Choose the password you will use for Kulka AI."}
    >
      <UpdatePasswordForm next={next} />
    </AuthShell>
  );
}
