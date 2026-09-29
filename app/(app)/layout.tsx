import { Rail } from "@/components/Rail";
import { RAIL_COOKIE } from "@/components/rail-cookie";
import { authIsOpen, authorizeRequest } from "@/lib/auth/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await authorizeRequest();
  if (!auth.ok) redirect("/login");
  // LA-1330: Keep Open is remembered in a cookie so a pinned rail paints
  // pinned on the first frame instead of opening a beat after load.
  const pinned = (await cookies()).get(RAIL_COOKIE)?.value === "pinned";
  return (
    <div className="app" data-rail={pinned ? "pinned" : "hover"}>
      {/* LA-1330: the first Tab offers the sheet, so a keyboard user does
          not walk the whole rail on every page. */}
      <a className="skip-link" href="#sheet">Skip to the Sheet</a>
      <Rail email={auth.user.email} openAccess={authIsOpen()} initialPinned={pinned} />
      <main className="field" id="sheet" tabIndex={-1}>{children}</main>
    </div>
  );
}
