import { closeThread } from "@/lib/rom/budget-comments";
import { threadShowsOnVersion } from "@/lib/rom/reader-posts";

import { answerError, guard, json, notFound, threadView } from "../../guard";

export const dynamic = "force-dynamic";

// LA-1487. POST /b/<token>/threads/<id>/close closes a comment or question, or
// withdraws a flag, by the reader who opened it. The body is JSON and carries
// nothing, so `{}` is enough. `guard` runs checks 1 to 3 and this route runs
// 6. Check 7 does not apply, because closing adds no row to count. Only the
// reader who opened the thread may close it, and `closeThread` enforces that.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string; id: string }> },
): Promise<Response> {
  const { token, id } = await params;
  const guarded = await guard(request, token, { newThread: false });
  if (guarded instanceof Response) return guarded;
  const { db, version, reader, cookies } = guarded;

  // 6. The thread is on this project and shows on this version's page.
  if (!(await threadShowsOnVersion(db, id, version))) return notFound();

  try {
    const thread = await closeThread(db, { threadId: id, by: { kind: "reader", readerId: reader.id } });
    return json(200, { thread: threadView(thread) }, cookies);
  } catch (cause) {
    return answerError(cause);
  }
}
