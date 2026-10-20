import { NextResponse, type NextRequest } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { saveConnection } from "@/lib/autodesk/connection";
import { NO_STORE, blockedRequest } from "@/lib/autodesk/gate";
import { AutodeskSignInError, SIGN_IN_COOKIE, checkSignIn, exchangeCode, signedInUser, userSettings } from "@/lib/autodesk/oauth";
import { getDb } from "@/lib/db";

// LA-2894. Autodesk sends the browser here after sign-in. The state must match
// the sealed cookie Connect set; then the code and PKCE verifier are traded for
// tokens on the server, sealed, and saved. The browser only ever sees a
// redirect back to Projects with a one-word outcome.

function back(request: NextRequest, outcome: string) {
  const url = new URL("/projects", request.url);
  url.searchParams.set("autodesk", outcome);
  const response = NextResponse.redirect(url, { status: 303, headers: { ...NO_STORE, "Referrer-Policy": "no-referrer" } });
  response.cookies.set(SIGN_IN_COOKIE, "", { httpOnly: true, path: "/api/autodesk", maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });
  const blocked = blockedRequest(request);
  if (blocked) return blocked;
  const settings = userSettings();
  if (!settings) return NextResponse.json({ error: "Autodesk sign-in is not set up." }, { status: 503, headers: NO_STORE });

  const params = request.nextUrl.searchParams;
  const verifier = checkSignIn(settings, request.cookies.get(SIGN_IN_COOKIE)?.value, params.get("state"));
  if (!verifier) return back(request, "state");
  if (params.get("error")) return back(request, params.get("error") === "access_denied" ? "denied" : "failed");
  const code = params.get("code");
  if (!code) return back(request, "failed");

  try {
    const tokens = await exchangeCode(settings, code, verifier, request.nextUrl.origin);
    const user = await signedInUser(tokens.accessToken);
    await saveConnection(getDb(), settings, user, tokens);
  } catch (cause) {
    if (cause instanceof AutodeskSignInError) return back(request, "failed");
    throw cause;
  }
  return back(request, "connected");
}
