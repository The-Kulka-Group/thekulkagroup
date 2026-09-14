import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth/server";

export async function requireVisionWriter(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return null;
}
