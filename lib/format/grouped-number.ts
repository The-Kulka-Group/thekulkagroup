// LA-2068: money and count inputs show 2,557,800 while the saved value stays 2557800.

const PLAIN_NUMBER = /^-?\d*\.?\d*$/;

/** Strips grouping commas and spaces. Returns undefined when what is left is not a number being typed. */
export function parseGroupedNumber(text: string): string | undefined {
  const plain = text.replace(/[,\s]/g, "");
  return PLAIN_NUMBER.test(plain) ? plain : undefined;
}

/** Adds thousands separators to the whole part of a plain number string and keeps the rest as typed. */
export function formatGroupedNumber(plain: string): string {
  const match = /^(-?)(\d*)(\.?\d*)$/.exec(plain);
  if (!match) return plain;
  const [, sign, whole, rest] = match;
  return `${sign}${whole.replace(/\B(?=(\d{3})+$)/g, ",")}${rest}`;
}

/** Where the caret goes after reformatting, so it stays after the same digits while the user types. */
export function caretAfterFormat(formatted: string, significantBeforeCaret: number): number {
  let seen = 0;
  for (let at = 0; at < formatted.length; at += 1) {
    if (seen === significantBeforeCaret) return at;
    if (formatted[at] !== ",") seen += 1;
  }
  return formatted.length;
}

export function countSignificant(text: string, end: number): number {
  return text.slice(0, end).replace(/[,\s]/g, "").length;
}
