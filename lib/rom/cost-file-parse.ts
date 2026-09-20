// Parses the generic tabular cost file LA-15 asks for: comma-separated, one
// header row naming its columns (case-insensitive, order-independent), one
// data row per cost line. LA-15's brief says "don't over-engineer the
// parser, this is v1" -- this handles the common subset of RFC 4180 (commas,
// optional double-quoted fields, "" as an escaped quote, and a quoted field
// that spans more than one physical line) and nothing more: no spreadsheet
// formats, no delimiter sniffing, no header aliases beyond the three names
// below.

export class CostFileParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostFileParseError";
  }
}

export type ParsedCostFileRow = {
  /**
   * The row's own 1-based line number in the original file, counting the
   * header as line 1 -- the number a person would find by opening the file
   * in a text editor or spreadsheet, not the row's position among only the
   * valid data rows. Becomes cost_import_lines.row_number.
   *
   * Fixed in code review (2026-09-20): the parser used to filter blank
   * lines out of the file text before numbering rows, so a blank separator
   * line anywhere in the file shifted every row after it away from its real
   * position. A quoted, multi-line description is one row with one
   * rowNumber -- the line its first cell starts on -- even though it spans
   * several physical lines.
   */
  rowNumber: number;
  description: string;
  division: string | null;
  value: number;
};

/** A data row the parser could not use, and why -- see parseCostFile's doc comment. */
export type SkippedCostFileRow = {
  rowNumber: number;
  reason: string;
};

export type ParseCostFileResult = {
  rows: ParsedCostFileRow[];
  skipped: SkippedCostFileRow[];
};

const REQUIRED_HEADERS = ["description", "value"] as const;

type RawRow = { cells: string[]; line: number };

/**
 * Splits the whole file into logical rows, tracking quote state across the
 * entire text rather than splitting into physical lines first. Fixed in code
 * review (2026-09-20): the old parser ran `text.split(/\r\n|\r|\n/)` before
 * any quote-aware parsing, so a quoted field containing a real newline (a
 * multi-line description pasted from Excel, say) was torn across two
 * "lines" and each fragment was parsed independently, corrupting both rows
 * instead of erroring or parsing correctly.
 *
 * `\r\n` and `\r` are normalized to `\n` up front, same as the old
 * behavior, so the state machine below only ever has to reason about `\n`.
 */
function splitLogicalRows(text: string): RawRow[] {
  const normalized = text.replace(/\r\n|\r/g, "\n");
  const rows: RawRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        // A newline inside an open quote is real file content, not a row
        // separator, but it is still a physical line break -- the next row
        // to start after this one must still get its true line number.
        if (char === "\n") line++;
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else if (char === "\n") {
      cells.push(cell);
      rows.push({ cells, line: rowStartLine });
      cells = [];
      cell = "";
      line++;
      rowStartLine = line;
    } else {
      cell += char;
    }
  }

  // The last row has no trailing newline to close it.
  if (cell.length > 0 || cells.length > 0) {
    cells.push(cell);
    rows.push({ cells, line: rowStartLine });
  }

  return rows.map((row) => ({ cells: row.cells.map((value) => value.trim()), line: row.line }));
}

/**
 * Required columns: "description" (matched against the canonical work
 * items) and "value" (a number, zero allowed). Optional column: "division",
 * a MasterFormat division code that sharpens the canonical-item match.
 *
 * A malformed file (no rows, a required column missing, or a header with no
 * data beneath it) still throws `CostFileParseError` synchronously, since
 * there is nothing usable to stage. A single bad data row no longer does:
 * fixed in code review (2026-09-20) after real construction cost exports
 * turned out to commonly include one legitimate reason a line reads $0
 * (an absorbed allowance, a VE credit, a credited change order) -- the old
 * parser threw on the first `value <= 0` row and aborted staging the whole
 * file over one line. Row-level problems (a blank description, a value that
 * is negative or not a number) are now collected into `skipped` instead,
 * so every other valid row in the file still stages; the caller
 * (lib/rom/ingest.ts's stageCostImport) reports what was skipped and why
 * rather than silently dropping it.
 *
 * Judgment call: a value cell that is present but blank is reported as
 * missing ("value" is required), not coerced to 0 -- `Number("")` is `0` in
 * JavaScript, which would otherwise make a blank cell indistinguishable
 * from a deliberately typed "0".
 */
export function parseCostFile(text: string): ParseCostFileResult {
  const rawRows = splitLogicalRows(text).filter((row) => row.cells.some((cell) => cell.length > 0));
  if (rawRows.length === 0) throw new CostFileParseError("The file has no rows.");

  const header = rawRows[0].cells.map((cell) => cell.toLowerCase());
  const missing = REQUIRED_HEADERS.filter((name) => !header.includes(name));
  if (missing.length > 0) {
    throw new CostFileParseError(`Missing required column(s): ${missing.join(", ")}.`);
  }
  if (rawRows.length === 1) throw new CostFileParseError("The file has a header but no data rows.");

  const descriptionIdx = header.indexOf("description");
  const valueIdx = header.indexOf("value");
  const divisionIdx = header.indexOf("division");

  const rows: ParsedCostFileRow[] = [];
  const skipped: SkippedCostFileRow[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const { cells, line } = rawRows[i];

    const description = cells[descriptionIdx]?.trim() ?? "";
    if (description.length === 0) {
      skipped.push({ rowNumber: line, reason: `"description" is required.` });
      continue;
    }

    const rawValue = cells[valueIdx]?.trim() ?? "";
    if (rawValue.length === 0) {
      skipped.push({ rowNumber: line, reason: `"value" is required.` });
      continue;
    }

    const value = Number(rawValue.replace(/[$,]/g, ""));
    if (!Number.isFinite(value) || value < 0) {
      skipped.push({
        rowNumber: line,
        reason: `"value" must be a non-negative number, got "${rawValue}".`,
      });
      continue;
    }

    const division = divisionIdx >= 0 ? cells[divisionIdx]?.trim() || null : null;

    rows.push({ rowNumber: line, description, division, value });
  }

  return { rows, skipped };
}
