// Parses the generic tabular cost file LA-15 asks for: comma-separated, one
// header row naming its columns (case-insensitive, order-independent), one
// data row per cost line. LA-15's brief says "don't over-engineer the
// parser, this is v1" -- this handles the common subset of RFC 4180 (commas,
// optional double-quoted fields, "" as an escaped quote) and nothing more:
// no spreadsheet formats, no delimiter sniffing, no header aliases beyond
// the three names below.

export class CostFileParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostFileParseError";
  }
}

export type ParsedCostFileRow = {
  /** 1-based position among data rows, not counting the header. Becomes cost_import_lines.row_number. */
  rowNumber: number;
  description: string;
  division: string | null;
  /** Read directly as usd_per_gsf -- see the migration's comment on value_usd_per_gsf for why. */
  value: number;
};

const REQUIRED_HEADERS = ["description", "value"] as const;

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

/**
 * Required columns: "description" (matched against the canonical work
 * items) and "value" (a positive number). Optional column: "division", a
 * MasterFormat division code that sharpens the canonical-item match.
 */
export function parseCostFile(text: string): ParsedCostFileRow[] {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) throw new CostFileParseError("The file has no rows.");

  const header = splitCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const missing = REQUIRED_HEADERS.filter((name) => !header.includes(name));
  if (missing.length > 0) {
    throw new CostFileParseError(`Missing required column(s): ${missing.join(", ")}.`);
  }
  if (lines.length === 1) throw new CostFileParseError("The file has a header but no data rows.");

  const descriptionIdx = header.indexOf("description");
  const valueIdx = header.indexOf("value");
  const divisionIdx = header.indexOf("division");

  const rows: ParsedCostFileRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const dataRowNumber = i; // 1-based, header excluded

    const description = cells[descriptionIdx]?.trim() ?? "";
    if (description.length === 0) {
      throw new CostFileParseError(`Row ${dataRowNumber}: "description" is required.`);
    }

    const rawValue = cells[valueIdx]?.trim() ?? "";
    const value = Number(rawValue.replace(/[$,]/g, ""));
    if (!Number.isFinite(value) || value <= 0) {
      throw new CostFileParseError(
        `Row ${dataRowNumber}: "value" must be a positive number, got "${rawValue}".`,
      );
    }

    const division = divisionIdx >= 0 ? cells[divisionIdx]?.trim() || null : null;

    rows.push({ rowNumber: dataRowNumber, description, division, value });
  }
  return rows;
}
