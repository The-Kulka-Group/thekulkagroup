import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { NO_STORE, blockedRequest } from "@/lib/autodesk/gate";
import { SIGN_IN_COOKIE, SIGN_IN_MAX_AGE, startSignIn, userSettings } from "@/lib/autodesk/oauth";

// LA-2894. Connect Autodesk: sends the browser to Autodesk's sign-in with a
// fresh state and PKCE challenge. The state and verifier ride back in a sealed,
// http-only cookie that only the callback reads.

export async function GET(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });
  const blocked = blockedRequest(request);
  if (blocked) return blocked;
  const settings = userSettings();
  if (!settings) return NextResponse.json({ error: "Autodesk sign-in is not set up." }, { status: 503, headers: NO_STORE });
  const url = new URL(request.url);
  const { url: autodesk, cookie } = startSignIn(settings, url.origin);
  const response = NextResponse.redirect(autodesk, { status: 302, headers: NO_STORE });
  response.cookies.set(SIGN_IN_COOKIE, cookie, {
    httpOnly: true,
    secure: url.protocol === "https:",
    // Lax, so the cookie comes back on Autodesk's top-level redirect to the callback.
    sameSite: "lax",
    path: "/api/autodesk",
    maxAge: SIGN_IN_MAX_AGE,
  });
  return response;
}
