// Framing system (LA-1103, Matt's call, 2026-09-25).
//
// Items 8 ("Wood framing") and 17 ("Metal framing and drywall") hold different
// scope depending on how a past job was framed. A load-bearing light-gauge
// metal job carries its structure and drywall on item 17 and nothing on 8. A
// wood frame job carries its structure on 8, and 17 holds only drywall,
// ceilings and interior studs. Blending the two on either item gives a number
// that describes neither, so on these two items only, the blend reads past
// jobs framed the same way as the project being estimated.
//
// Pure, like the rest of the engine: the caller hands over each past job's
// recorded framing system, and this file only sorts rows by it.

export type FramingSystem = "wood" | "metal";

/** The only canonical items whose scope turns on the framing system. */
export const FRAMING_ITEM_CODES: ReadonlySet<string> = new Set(["8", "17"]);

export const FRAMING_WORDS: Record<FramingSystem, string> = {
  wood: "wood frame",
  metal: "load-bearing metal frame",
};

/** Why one row stays out of the blend, or null when it goes in. */
export function framingExclusionReason(
  sourceProjectIds: readonly string[],
  target: FramingSystem,
  sourceFraming: Readonly<Record<string, FramingSystem>>,
): string | null {
  if (sourceProjectIds.length === 0) {
    return `No past job stands behind this figure, so nothing shows it was ${FRAMING_WORDS[target]}.`;
  }
  const unset = sourceProjectIds.filter((id) => !sourceFraming[id]);
  if (unset.length > 0) {
    return "The framing system of the past job behind this figure is not recorded.";
  }
  const differs = sourceProjectIds.filter((id) => sourceFraming[id] !== target);
  if (differs.length > 0) {
    const theirs = sourceFraming[differs[0]];
    return `Framing system differs: that job was ${FRAMING_WORDS[theirs]}, this project is ${FRAMING_WORDS[target]}.`;
  }
  return null;
}
