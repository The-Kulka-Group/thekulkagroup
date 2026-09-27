// LA-1142's motion primitives, shared by LiveBudget.tsx and the element box
// (LA-1158). One easing curve and one reduced-motion check for the whole /rom
// folder, so a box's tiles move the same way a trade block already does.

export const EASE_SMOOTH = "cubic-bezier(0.22, 1, 0.36, 1)";

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
