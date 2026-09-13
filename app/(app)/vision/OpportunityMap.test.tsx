import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import type {DiscoveryMapPoint} from "@/lib/vision/map-points";
import type {VisionOpportunity} from "@/lib/vision/types";
import {OpportunityMap} from "./OpportunityMap";

vi.mock("next/navigation", () => ({useRouter: () => ({push: vi.fn()})}));

const tracked = (overrides: Partial<VisionOpportunity>): VisionOpportunity => ({
  id: "tracked-1",
  sheetNumber: "V-101",
  name: "Tracked record",
  town: "",
  county: "Suffolk",
  address: "",
  latitude: null,
  longitude: null,
  sourceTitle: "Test source",
  sourceUrl: "https://example.org/tracked",
  sourceDate: null,
  notes: "",
  status: "open",
  revision: 1,
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
  ...overrides,
});

const discovery = (overrides: Partial<DiscoveryMapPoint>): DiscoveryMapPoint => ({
  id: "discovery-1",
  name: "Discovered record",
  town: "",
  county: "Suffolk",
  address: "",
  latitude: null,
  longitude: null,
  ...overrides,
});

describe("Vision opportunity map", () => {
  it("shows approximate counts, labels, and links without calling an address service", () => {
    const html = renderToStaticMarkup(createElement(OpportunityMap, {
      discoveries: [
        discovery({id: "hauppauge", name: "35 Adams Avenue", address: "35 Adams Avenue, Hauppauge, NY", town: "Town of Smithtown"}),
        discovery({id: "located", name: "Located record", latitude: 40.8, longitude: -73.4}),
      ],
      opportunities: [
        tracked({id: "islandia", name: "Islandia tracked record", town: "Village of Islandia"}),
        tracked({id: "unknown", name: "Unknown tracked record", town: "Unknown Place"}),
      ],
    }));

    expect(html).toContain("1 with source or saved coordinates · 2 approximate · 1 unmapped");
    expect(html).toContain("≈ Approximate areas");
    expect(html).toContain("≈ Hauppauge area · 35 Adams Avenue");
    expect(html).toContain('href="/vision/discover?record=hauppauge"');
    expect(html).toContain("≈ Islandia area · Islandia tracked record");
    expect(html).toContain('href="/vision/islandia"');
    expect(html).toContain("Gold ≈ pills place records at a named area center because project coordinates are not known.");
    expect(html).toContain("1 record remains unmapped.");
    expect(html).toContain('href="/vision/unknown#location"');
  });
});
