// LA-1459. The MasterFormat division of each canonical work item, by item
// number, as docs/precon/masterformat-divisions.md records it (confirmed by
// Matt, 2026-09-27, stored on canonical_work_items by LA-1214). The published
// page reads a frozen snapshot and no table, so the client ledger orders its
// rows from this copy. A code with no row here carries no division and sorts
// last, the same rule field-order.ts follows; nothing guesses one from the
// item number's digits.

export const ITEM_DIVISIONS: Readonly<Record<string, string>> = {
  "1": "02",
  "1a": "02",
  "2": "03",
  "3": "03",
  "3a": "03",
  "4": "03",
  "5": "04",
  "6": "04",
  "7": "05",
  "7a": "05",
  "8": "06",
  "8a": "06",
  "9": "06",
  "10": "06",
  "11": "06",
  "12": "07",
  "13": "07",
  "14": "07",
  "14a": "07",
  "15": "08",
  "15a": "08",
  "16": "08",
  "16a": "08",
  "17": "09",
  "18": "09",
  "19": "09",
  "19a": "09",
  "20": "09",
  "21": "10",
  "22": "11",
  "23": "14",
  "24": "12",
  "24a": "12",
  "24b": "12",
  "25": "13",
  "26": "14",
  "27": "21",
  "28": "22",
  "28a": "22",
  "28b": "22",
  "29": "22",
  "30": "23",
  "31": "26",
  "31a": "27",
  "31b": "26",
  "31c": "26",
  "31d": "26",
  "31e": "26",
  "31f": "26",
  "32": "28",
  "32a": "28",
  "33": "31",
  "34": "31",
  "34a": "31",
  "35": "33",
  "36": "33",
  "36a": "33",
  "37": "32",
  "38": "32",
  "39": "32",
};

export const ITEM_DIVISION_MAP: ReadonlyMap<string, string> = new Map(Object.entries(ITEM_DIVISIONS));

/** "8a" sorts after "8" and before "9": the number first, then the letter. */
export function compareItemCodes(a: string, b: string): number {
  const pa = /^(\d+)([a-z]*)$/.exec(a);
  const pb = /^(\d+)([a-z]*)$/.exec(b);
  if (pa && pb) return Number(pa[1]) - Number(pb[1]) || pa[2].localeCompare(pb[2]);
  return a.localeCompare(b, "en", { numeric: true });
}
