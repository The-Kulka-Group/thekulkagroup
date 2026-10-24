import { cookies } from "next/headers";
import { cache } from "react";

import { authorizeRequest, isUnrestrictedUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";

import { parseViewAs, resolveViewer, VIEW_AS_COOKIE, type Viewer } from "./viewer";

// LA-3047. The viewer for the page being rendered, read once per request.

export const currentViewer = cache(async (): Promise<Viewer> => {
  const auth = await authorizeRequest();
  if (!auth.ok) return { access: null, canViewAs: false, viewingAs: null };
  const viewAs = parseViewAs((await cookies()).get(VIEW_AS_COOKIE)?.value);
  const unrestricted = isUnrestrictedUser(auth.user);
  if (unrestricted && !viewAs) return { access: { roleKey: "owner", roleAccess: [], exceptions: [] }, canViewAs: true, viewingAs: null };
  return resolveViewer(getDb(), { email: auth.user.email, unrestricted }, viewAs);
});
