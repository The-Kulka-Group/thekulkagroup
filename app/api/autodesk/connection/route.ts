import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { deleteConnection, readConnection } from "@/lib/autodesk/connection";
import { NO_STORE, blockedRequest } from "@/lib/autodesk/gate";
import { revokeRefreshToken, userSettings } from "@/lib/autodesk/oauth";
import { getDb } from "@/lib/db";

// LA-2894. GET says who Kulka reads Autodesk as; it holds no token. DELETE is
// Disconnect: it deletes the row and asks Autodesk to retire the refresh token.

export async function GET(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });
  const blocked = blockedRequest(request);
  if (blocked) return blocked;
  return NextResponse.json({ connection: await readConnection(getDb()) }, { headers: NO_STORE });
}

export async function DELETE(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });
  const blocked = blockedRequest(request);
  if (blocked) return blocked;
  const settings = userSettings();
  if (!settings) return NextResponse.json({ error: "Autodesk sign-in is not set up." }, { status: 503, headers: NO_STORE });
  const refreshToken = await deleteConnection(getDb(), settings);
  if (refreshToken) await revokeRefreshToken(settings, refreshToken);
  return NextResponse.json({ disconnected: true }, { headers: NO_STORE });
}
