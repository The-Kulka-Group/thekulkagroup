import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth/server";

export async function requireVisionWriter(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.user.temporary) return NextResponse.json({ error: "Sign in with an authorized account to save Vision opportunities." }, { status: 403 });
  return null;
}
