import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { CostImportNotFound, getCostImport } from "@/lib/rom/ingest";
import { isUuid } from "@/lib/uuid";

// The staging review view (LA-15 AC1): one import and every one of its
// lines, whatever their status, so a reviewer can see what will and will not
// promote before approving.

type Context = { params: Promise<{ id: string }> };
const missing = () => NextResponse.json({ error: "Cost import not found." }, { status: 404 });

export async function GET(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  if (!isUuid(id)) return missing();

  try {
    return NextResponse.json({ costImport: await getCostImport(getDb(), id) });
  } catch (cause) {
    if (cause instanceof CostImportNotFound) return missing();
    throw cause;
  }
}
