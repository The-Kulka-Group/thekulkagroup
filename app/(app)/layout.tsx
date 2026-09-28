import { Rail } from "@/components/Rail";
import { authIsOpen, authorizeRequest } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await authorizeRequest();
  if (!auth.ok) redirect("/login");
  return (
    <div className="app">
      <Rail email={auth.user.email} openAccess={authIsOpen()} />
      <main className="field">{children}</main>
    </div>
  );
}
