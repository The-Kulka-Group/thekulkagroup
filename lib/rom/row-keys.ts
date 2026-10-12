// LA-2209 review M4: the keys a budget row goes by. The Building View's list
// (part-prices.ts, level-rows.ts) and the client page (presentation.ts) both
// key a row by what it holds: an ADR 0002 element, one canonical item's line,
// or an item with no rate yet. This is the one place that spells them.

export type RowKind = "element" | "line" | "unpriced";
export type RowKey = `${RowKind}:${string}`;

const KINDS: ReadonlySet<string> = new Set<RowKind>(["element", "line", "unpriced"]);

/** "element:Elevator", "line:26a", "unpriced:36a". */
export function rowKey(kind: RowKind, id: string): RowKey {
  return `${kind}:${id}`;
}

/** A key's kind and id, or null for a key of no known kind or with no id. */
export function parseRowKey(key: string): { kind: RowKind; id: string } | null {
  const at = key.indexOf(":");
  if (at < 0) return null;
  const kind = key.slice(0, at);
  const id = key.slice(at + 1);
  return KINDS.has(kind) && id !== "" ? { kind: kind as RowKind, id } : null;
}
