import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveredRecord } from "./discovery-source";

const fetchNassauPlanning = vi.hoisted(() => vi.fn());
const fetchSuffolkPlanning = vi.hoisted(() => vi.fn());
const fetchNassauIda = vi.hoisted(() => vi.fn());
const fetchSuffolkIda = vi.hoisted(() => vi.fn());

vi.mock("./discovery-source", () => ({ fetchDiscoveryRecords: fetchNassauPlanning }));
vi.mock("./suffolk-source", () => ({ fetchSuffolkRecords: fetchSuffolkPlanning }));
vi.mock("./ida-source", () => ({
  fetchNassauIdaRecords: fetchNassauIda,
  fetchSuffolkIdaRecords: fetchSuffolkIda,
}));

const {
  AUTOMATED_SOURCE_DEFINITIONS,
  REGISTERED_SOURCE_ADAPTER_KEYS,
  collectAutomatedSource,
  discoverySourceId,
  validateAutomatedSourceDefinitions,
} = await import("./source-registry");

const record: DiscoveredRecord = {
  externalId: "test-1",
  name: "Test source record",
  town: "Test town",
  county: "Nassau",
  address: "1 Test Street",
  latitude: null,
  longitude: null,
  sourceTitle: "Test authority",
  sourceUrl: "https://example.org/record/1",
  sourceDate: "2026-09-09",
  sourceDateLabel: "Source date",
  details: { "Record type": "Test record" },
};

beforeEach(() => {
  for (const fetcher of [fetchNassauPlanning, fetchSuffolkPlanning, fetchNassauIda, fetchSuffolkIda]) {
    fetcher.mockReset();
    fetcher.mockResolvedValue([record]);
  }
});

describe("Vision automated source registry", () => {
  it("defines every current source with fixed identity, adapter, endpoint, bounds and evidence rules", () => {
    expect(AUTOMATED_SOURCE_DEFINITIONS.map(source => source.id)).toEqual([
      "nassau-applications",
      "suffolk-planning",
      "nassau-ida",
      "suffolk-ida",
    ]);

    for (const source of AUTOMATED_SOURCE_DEFINITIONS) {
      expect(source.officialAgency).toBeTruthy();
      expect(source.jurisdiction).toBeTruthy();
      expect(REGISTERED_SOURCE_ADAPTER_KEYS).toContain(source.adapterKey);
      expect(source.endpoint.url).toMatch(/^https:\/\//);
      expect(source.endpoint.allowedOrigins).toContain(new URL(source.endpoint.url).origin);
      expect(source.limits.maxRequests).toBeGreaterThan(0);
      expect(source.limits.maxRecords).toBeGreaterThan(0);
      expect(source.limits.maxResponseBytes).toBeGreaterThan(0);
      expect(source.limits.maxDurationMs).toBeGreaterThan(0);
      expect(source.identityRule).toBeTruthy();
      expect(source.evidenceRule).toBeTruthy();
      expect(source.schedule.cadence).toBe("daily");
      expect(source.enabled).toBe(true);
      expect(Object.isFrozen(source)).toBe(true);
    }
  });

  it("runs all four collectors through one adapter result contract", async () => {
    fetchSuffolkPlanning.mockResolvedValue([{ ...record, details: { "Collection year": "2026" } }]);

    for (const source of AUTOMATED_SOURCE_DEFINITIONS) {
      const result = await collectAutomatedSource(source.id);
      expect(result.records).toHaveLength(1);
      if (source.id === "suffolk-planning") {
        expect(result.coverage).toEqual({ year: 2026, documents: [] });
      } else {
        expect(result.coverage).toBeNull();
      }
    }

    expect(fetchNassauPlanning).toHaveBeenCalledOnce();
    expect(fetchSuffolkPlanning).toHaveBeenCalledOnce();
    expect(fetchNassauIda).toHaveBeenCalledOnce();
    expect(fetchSuffolkIda).toHaveBeenCalledOnce();
  });

  it("rejects unsupported IDs and request objects before a collector can run", async () => {
    expect(() => discoverySourceId("unsupported")).toThrow("Choose a supported source");
    expect(() => discoverySourceId({ id: "nassau-applications", url: "https://evil.test" })).toThrow("Choose a supported source");
    await expect(collectAutomatedSource("unsupported")).rejects.toThrow("Choose a supported source");
    expect(fetchNassauPlanning).not.toHaveBeenCalled();
    expect(fetchSuffolkPlanning).not.toHaveBeenCalled();
    expect(fetchNassauIda).not.toHaveBeenCalled();
    expect(fetchSuffolkIda).not.toHaveBeenCalled();
  });

  it("rejects duplicate sources, unknown adapters and endpoint origins outside the fixed allowlist", () => {
    const [source] = AUTOMATED_SOURCE_DEFINITIONS;
    expect(() => validateAutomatedSourceDefinitions([source, source])).toThrow("Duplicate automated source ID");
    expect(() => validateAutomatedSourceDefinitions([{ ...source, id: "unknown-adapter", adapterKey: "missing-adapter" }])).toThrow("unregistered adapter");
    expect(() => validateAutomatedSourceDefinitions([{ ...source, id: "bad-origin", endpoint: { ...source.endpoint, url: "https://evil.test/feed" } }])).toThrow("fixed allowed origin");
  });
});
