import { replyToThread } from "@/lib/rom/budget-comments";
import { MAX_MESSAGES_PER_DAY, postsInLastDay, threadShowsOnVersion } from "@/lib/rom/reader-posts";

import { answerError, guard, json, messageView, notFound, optionalText, threadView, tooManyPosts } from "../../guard";

export const dynamic = "force-dynamic";

// LA-1487. POST /b/<token>/threads/<id>/messages adds a reader reply. The body
// is JSON: { body }. `guard` runs checks 1 to 3. This route runs 6 and 7.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string; id: string }> },
): Promise<Response> {
  const { token, id } = await params;
  const guarded = await guard(request, token, { newThread: false });
  if (guarded instanceof Response) return guarded;
  const { db, version, reader, deviceId, body, cookies } = guarded;

  const text = optionalText(body.body);
  if (text === undefined || text === null) return json(400, { error: "A reply needs text." });

  // 6. The thread is on this project and shows on this version's page.
  if (!(await threadShowsOnVersion(db, id, version))) return notFound();

  // 7. 60 messages in a day.
  const used = await postsInLastDay(db, reader.id);
  if (used.messages >= MAX_MESSAGES_PER_DAY) return tooManyPosts();

  try {
    const { thread, message } = await replyToThread(db, { threadId: id, author: "reader", readerId: reader.id, deviceId, body: text });
    return json(201, { thread: threadView(thread), message: messageView(message) }, cookies);
  } catch (cause) {
    return answerError(cause);
  }
}
