// LA-1148. Every label in Kulka AI is title case. Most labels are written
// that way in code, config, and fixtures, and are fixed there. A name that
// comes from an import or a stored row (a block, a line, a package, an
// element, a canonical item) is not: it is a raw description off a cost
// export, so this formatter puts it in title case at display time instead
// of touching the stored value.
//
// Rules (Matt, 2026-09-27):
//   - Capitalize every word, including each side of a hyphenated word.
//   - A short word stays lowercase unless it opens the string. This applies
//     inside a hyphenated word too.
//   - An acronym or a code keeps its own case: "USD", "TBD", "GRs/GCs",
//     "ROM", "(Type III)", "SF". A token that is all uppercase, or that
//     carries a digit or a slash, is left exactly as it is.

const SHORT_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "in",
  "is",
  "of",
  "on",
  "or",
  "per",
  "the",
  "to",
  "with",
]);

/** True when a run of letters is all uppercase and more than one letter: an acronym. */
function isAcronym(word: string): boolean {
  const letters = word.replace(/[^A-Za-z]/g, "");
  return letters.length > 1 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

function hasDigitOrSlash(word: string): boolean {
  return /[0-9/]/.test(word);
}

function capitalizeSegment(segment: string, isFirstWordOfString: boolean): string {
  if (segment.length === 0) return segment;
  const lower = segment.toLowerCase();
  if (!isFirstWordOfString && SHORT_WORDS.has(lower)) return lower;
  return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
}

/** Title-cases one whitespace-delimited word, preserving leading/trailing punctuation. */
function titleCaseWord(word: string, isFirstWordOfString: boolean): string {
  const match = word.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/s);
  if (!match) return word;
  const [, lead, core, trail] = match;
  if (core.length === 0) return word;

  if (hasDigitOrSlash(core) || isAcronym(core)) {
    return lead + core + trail;
  }

  const parts = core.split("-");
  const titled = parts
    .map((part, index) => capitalizeSegment(part, isFirstWordOfString && index === 0))
    .join("-");

  return lead + titled + trail;
}

/** Puts free text in title case per Kulka's rules. Safe to call more than once: it is idempotent. */
export function titleCase(text: string): string {
  if (!text) return text;
  const words = text.split(" ");
  let seenFirstWord = false;
  return words
    .map((word) => {
      const hasCore = /[A-Za-z0-9]/.test(word);
      const isFirst = hasCore && !seenFirstWord;
      if (hasCore) seenFirstWord = true;
      return titleCaseWord(word, isFirst);
    })
    .join(" ");
}
