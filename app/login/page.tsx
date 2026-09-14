import { AuthShell } from "@/components/auth/AuthShell";
import { safeReturnPath } from "@/lib/auth/policy";
import { LoginForm } from "./LoginForm";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeReturnPath((await searchParams).next);
  return (
    <AuthShell
      title="Sign In"
      description="The Kulka Group workspace"
    >
      <LoginForm next={next} />
    </AuthShell>
  );
}
