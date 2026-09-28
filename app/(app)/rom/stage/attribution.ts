import { reducedMotion } from "../motion";

// LA-1318: which boxes a moment moved, and by how much, so its price tag can
// fly to them. A snapshot is every box's midpoint at one instant; the moves
// are the difference between two. A change of gross area moves every figure
// at once, so it names nothing, the same rule the header's change flash uses.

export type Snapshot = { area: number | null; entries: ReadonlyMap<string, number> };
export type Move = { key: string; amount: number };

export function snapshotOf(entries: readonly { key: string; midpoint: number }[], area: number | null): Snapshot {
  return { area, entries: new Map(entries.map((e) => [e.key, e.midpoint])) };
}

/** The boxes that moved by at least `min` dollars, largest first. A box that came or went counts from zero. */
export function movesBetween(before: Snapshot, after: Snapshot, min = 1000): Move[] {
  if (before.area !== after.area) return [];
  const keys = new Set([...before.entries.keys(), ...after.entries.keys()]);
  const moves: Move[] = [];
  for (const key of keys) {
    const amount = (after.entries.get(key) ?? 0) - (before.entries.get(key) ?? 0);
    if (Math.abs(amount) >= min) moves.push({ key, amount });
  }
  return moves.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

/**
 * Flies a price tag from a point on screen into a box, on an arc, and
 * resolves when it lands. Under reduced motion it resolves at once, and the
 * box's source line still appears.
 */
export function flyTag(text: string, from: { x: number; y: number }, to: HTMLElement, up: boolean, delay = 0): Promise<void> {
  if (reducedMotion() || typeof document === "undefined") return Promise.resolve();
  const box = to.getBoundingClientRect();
  // Aimed at the box's top right, where its source line appears. A box below
  // the fold is aimed at the bottom of the screen, not off it.
  const tx = box.right - 56;
  const ty = Math.min(box.top + 18, window.innerHeight - 24);
  const tag = document.createElement("span");
  tag.className = `stg-tag num stg-tag--${up ? "up" : "down"}`;
  tag.textContent = text;
  tag.setAttribute("aria-hidden", "true");
  tag.style.left = `${from.x}px`;
  tag.style.top = `${from.y}px`;
  document.body.appendChild(tag);
  const dx = tx - from.x, dy = ty - from.y;
  // The arc lifts first, then falls into the box.
  const lift = Math.min(90, Math.abs(dy) * 0.35 + 40);
  const animation = tag.animate(
    [
      { transform: "translate(-50%, -50%) scale(0.6)", opacity: 0, offset: 0 },
      { transform: "translate(-50%, calc(-50% - 16px)) scale(1)", opacity: 1, offset: 0.14 },
      { transform: `translate(calc(-50% + ${dx * 0.45}px), calc(-50% + ${dy * 0.35 - lift}px)) scale(1)`, opacity: 1, offset: 0.52 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.82)`, opacity: 1, offset: 0.92 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.6)`, opacity: 0, offset: 1 },
    ],
    { duration: 820, delay, easing: "cubic-bezier(0.32, 0.72, 0.24, 1)", fill: "both" },
  );
  return animation.finished.then(
    () => tag.remove(),
    () => tag.remove(),
  );
}
