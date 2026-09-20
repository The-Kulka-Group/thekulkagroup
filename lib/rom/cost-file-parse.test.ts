import { describe, expect, it } from "vitest";

import { CostFileParseError, parseCostFile } from "./cost-file-parse";

describe("parseCostFile", () => {
  it("parses a well-formed file, including a quoted description with commas", () => {
    const text = [
      "description,division,value",
      '"Foundations, footings, and slab-on-grade",03,42.50',
      "Elevators,14,1200",
    ].join("\n");

    expect(parseCostFile(text)).toEqual([
      { rowNumber: 1, description: "Foundations, footings, and slab-on-grade", division: "03", value: 42.5 },
      { rowNumber: 2, description: "Elevators", division: "14", value: 1200 },
    ]);
  });

  it("accepts columns in any order and case", () => {
    const text = ["VALUE,DESCRIPTION", "10,Roofing"].join("\n");
    expect(parseCostFile(text)).toEqual([{ rowNumber: 1, description: "Roofing", division: null, value: 10 }]);
  });

  it("treats a missing division column as null for every row", () => {
    const text = ["description,value", "Roofing,10"].join("\n");
    expect(parseCostFile(text)[0].division).toBeNull();
  });

  it("strips a leading dollar sign and thousands separators from value", () => {
    const text = ["description,value", 'Roofing,"$1,234.50"'].join("\n");
    expect(parseCostFile(text)[0].value).toBe(1234.5);
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

  it("rejects a row with a blank description", () => {
    expect(() => parseCostFile("description,value\n,10")).toThrow(/description/);
  });

  it("rejects a row whose value is not a positive number", () => {
    expect(() => parseCostFile("description,value\nRoofing,0")).toThrow(/positive number/);
    expect(() => parseCostFile("description,value\nRoofing,not-a-number")).toThrow(/positive number/);
    expect(() => parseCostFile("description,value\nRoofing,-5")).toThrow(/positive number/);
  });
});
