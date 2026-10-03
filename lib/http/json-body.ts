export const MAX_JSON_BODY_BYTES = 1_000_000;

export class JsonBodyTooLarge extends Error {}
export class InvalidJsonBody extends Error {}

/** Reads a JSON body of at most `maxBytes`, 1 MB unless the caller sets a smaller cap. */
export async function readJsonBody(request: Request, maxBytes = MAX_JSON_BODY_BYTES): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new JsonBodyTooLarge();
  }

  if (!request.body) throw new InvalidJsonBody();
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const text: string[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new JsonBodyTooLarge();
      }
      text.push(decoder.decode(value, { stream: true }));
    }
    text.push(decoder.decode());
    return JSON.parse(text.join(""));
  } catch (cause) {
    if (cause instanceof JsonBodyTooLarge) throw cause;
    throw new InvalidJsonBody();
  }
}
