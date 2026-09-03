import { safeReturnPath } from "@/lib/auth/policy";
import { LoginForm } from "./LoginForm";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeReturnPath((await searchParams).next);
  return (
    <div className="login">
      <div className="login-column">
        <div className="login-mark">
          Kulka<span className="logo-ai">AI</span>
        </div>
        <h1>Sign In</h1>
        <p className="t-meta sub">The Kulka Group workspace</p>
        <LoginForm next={next} />
      </div>
    </div>
  );
}
