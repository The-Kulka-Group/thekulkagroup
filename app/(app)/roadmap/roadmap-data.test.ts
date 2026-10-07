import { describe, expect, it } from "vitest";
import { ROADMAP_AS_OF, STATUS_LABEL, WORKSTREAMS } from "./roadmap-data";

const items = WORKSTREAMS.flatMap((w) => w.items);

describe("roadmap data", () => {
  it("dates every built item on a real day no later than the as-of date", () => {
    for (const item of items.filter((i) => i.status === "built")) {
      expect(item.date, item.title).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(item.date!)), item.title).toBe(false);
      expect(item.date! <= ROADMAP_AS_OF, item.title).toBe(true);
    }
  });

  it("uses only known statuses and Linear-style ticket ids", () => {
    for (const item of items) {
      expect(Object.keys(STATUS_LABEL)).toContain(item.status);
      if (item.ticket) expect(item.ticket).toMatch(/^LA-\d+$/);
    }
  });

  it("names each ticket once", () => {
    const tickets = items.flatMap((i) => (i.ticket ? [i.ticket] : []));
    expect(new Set(tickets).size).toBe(tickets.length);
  });

  it("gives each workstream a unique key", () => {
    const keys = WORKSTREAMS.map((w) => w.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
