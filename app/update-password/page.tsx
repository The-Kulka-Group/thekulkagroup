import { redirect } from "next/navigation";

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
    <div className="login">
      <div className="login-column">
        <div className="login-mark">Kulka<span className="logo-ai">AI</span></div>
        <h1>{recovery ? "Reset Password" : "Create Password"}</h1>
        <p className="t-meta sub">
          {recovery
            ? "Choose a new password for Kulka AI."
            : "Choose the password you will use for Kulka AI."}
        </p>
        <UpdatePasswordForm next={next} />
      </div>
    </div>
  );
}
