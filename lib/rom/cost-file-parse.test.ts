import { describe, expect, it } from "vitest";

import { CostFileParseError, parseCostFile } from "./cost-file-parse";

describe("parseCostFile", () => {
  it("parses a well-formed file, including a quoted description with commas", () => {
    const text = [
      "description,division,value",
      '"Foundations, footings, and slab-on-grade",03,42.50',
      "Elevators,14,1200",
    ].join("\n");

    // rowNumber is the row's own physical line number in the file (the
    // header is line 1), not its position among only the data rows.
    expect(parseCostFile(text)).toEqual({
      rows: [
        { rowNumber: 2, description: "Foundations, footings, and slab-on-grade", division: "03", value: 42.5 },
        { rowNumber: 3, description: "Elevators", division: "14", value: 1200 },
      ],
      skipped: [],
    });
  });

  it("accepts columns in any order and case", () => {
    const text = ["VALUE,DESCRIPTION", "10,Roofing"].join("\n");
    expect(parseCostFile(text).rows).toEqual([{ rowNumber: 2, description: "Roofing", division: null, value: 10 }]);
  });

  it("treats a missing division column as null for every row", () => {
    const text = ["description,value", "Roofing,10"].join("\n");
    expect(parseCostFile(text).rows[0].division).toBeNull();
  });

  it("strips a leading dollar sign and thousands separators from value", () => {
    const text = ["description,value", 'Roofing,"$1,234.50"'].join("\n");
    expect(parseCostFile(text).rows[0].value).toBe(1234.5);
  });

  it("accepts a $0 row instead of rejecting it (absorbed allowances, VE credits, and credited change orders are real, common rows)", () => {
    const text = ["description,value", "VE credit,0"].join("\n");
    expect(parseCostFile(text).rows).toEqual([{ rowNumber: 2, description: "VE credit", division: null, value: 0 }]);
  });

  it("rejects a file with no rows", () => {
    expect(() => parseCostFile("")).toThrow(CostFileParseError);
  });

  it("rejects a file missing the description column", () => {
    expect(() => parseCostFile("value\n10")).toThrow(/description/);
  });

  it("rejects a file missing the value column", () => {
    expect(() => parseCostFile("description\nRoofing")).toThrow(/value/);
  });

  it("rejects a header with no data rows", () => {
    expect(() => parseCostFile("description,value")).toThrow(CostFileParseError);
  });

  it("keeps a well-formed row when a blank line separates it from a bad one, correctly numbered by real file position (LA-15 review fix)", () => {
    const text = ["description,value", "", "Roofing,10", "", "Elevators,not-a-number"].join("\n");
    const result = parseCostFile(text);

    expect(result.rows).toEqual([{ rowNumber: 3, description: "Roofing", division: null, value: 10 }]);
    expect(result.skipped).toEqual([
      { rowNumber: 5, reason: '"value" must be a non-negative number, got "not-a-number".' },
    ]);
  });

  describe("a single bad row no longer aborts the whole file (LA-15 review fix)", () => {
    it("skips a row with a blank description instead of throwing, and keeps every other valid row", () => {
      const text = ["description,value", ",10", "Roofing,20"].join("\n");
      const result = parseCostFile(text);

      expect(result.rows).toEqual([{ rowNumber: 3, description: "Roofing", division: null, value: 20 }]);
      expect(result.skipped).toEqual([{ rowNumber: 2, reason: '"description" is required.' }]);
    });

    it("skips a row with a missing value instead of throwing", () => {
      const text = ["description,value", "Roofing,", "Elevators,20"].join("\n");
      const result = parseCostFile(text);

      expect(result.rows).toEqual([{ rowNumber: 3, description: "Elevators", division: null, value: 20 }]);
      expect(result.skipped).toEqual([{ rowNumber: 2, reason: '"value" is required.' }]);
    });

    it("skips a row whose value is not a number instead of throwing", () => {
      const text = ["description,value", "Roofing,not-a-number", "Elevators,20"].join("\n");
      const result = parseCostFile(text);

      expect(result.rows).toEqual([{ rowNumber: 3, description: "Elevators", division: null, value: 20 }]);
      expect(result.skipped).toEqual([
        { rowNumber: 2, reason: '"value" must be a non-negative number, got "not-a-number".' },
      ]);
    });

    it("skips a row with a negative value instead of throwing", () => {
      const text = ["description,value", "Roofing,-5", "Elevators,20"].join("\n");
      const result = parseCostFile(text);

      expect(result.rows).toEqual([{ rowNumber: 3, description: "Elevators", division: null, value: 20 }]);
      expect(result.skipped).toEqual([{ rowNumber: 2, reason: '"value" must be a non-negative number, got "-5".' }]);
    });
  });

  describe("a quoted field spanning multiple physical lines (LA-15 review fix)", () => {
    it("keeps a multi-line quoted description as one row instead of corrupting it into fragments", () => {
      const text = [
        'description,division,value',
        '"Foundation',
        'wall repair",03,10.00',
        "Roofing,05,20",
      ].join("\n");

      const result = parseCostFile(text);
      expect(result.skipped).toEqual([]);
      expect(result.rows).toEqual([
        // Starts at line 2 (where the opening quote is); the description
        // keeps its real embedded newline.
        { rowNumber: 2, description: "Foundation\nwall repair", division: "03", value: 10 },
        // Line 4: the quoted field spanned lines 2-3, so the next row
        // correctly picks up at line 4, not line 3.
        { rowNumber: 4, description: "Roofing", division: "05", value: 20 },
      ]);
    });
  });
});
