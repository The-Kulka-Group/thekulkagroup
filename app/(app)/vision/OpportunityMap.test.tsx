import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import {groupApproximateAreaPoints, partitionMapPoints, type DiscoveryMapPoint} from "@/lib/vision/map-points";
import type {VisionOpportunity} from "@/lib/vision/types";
import {ApproximateAreaPopup, OpportunityMap} from "./OpportunityMap";

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
  it("shows compact approximate counts without adding a directory below the map", () => {
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

    expect(html).toContain("1 source or saved · 2 approximate · 1 unmapped");
    expect(html).not.toContain("Approximate areas");
    expect(html).toContain("Gold ≈ pills place records at a named area center because project coordinates are not known.");
    expect(html).toContain("1 record remains unmapped.");
    expect(html).toContain('href="/vision/unknown#location"');
  });

  it("offers tracked and source-record actions in one accessible area popup", () => {
    const trackedRecord = tracked({id: "tracked-1", name: "Tracked record", town: "Hauppauge"});
    const sourceRecord = discovery({id: "source-1", name: "35 Adams Avenue", town: "Hauppauge"});
    const trackedPoint = partitionMapPoints([trackedRecord]).approximate[0];
    const sourcePoint = partitionMapPoints([sourceRecord]).approximate[0];
    const [group] = groupApproximateAreaPoints([
      {kind: "tracked", point: trackedPoint},
      {kind: "source-record", point: sourcePoint},
    ]);
    const html = renderToStaticMarkup(createElement(ApproximateAreaPopup, {
      group,
      trackedById: new Map([[trackedRecord.id, trackedRecord]]),
    }));

    expect(html.match(/Records in the approximate Hauppauge area/g)).toHaveLength(1);
    expect(html).toContain("2 records in the approximate Hauppauge area");
    expect(html).toContain('href="/vision/tracked-1#location"');
    expect(html).toContain("Tracked · V-101 · Tracked record · Resolve location");
    expect(html).toContain('href="/vision/discover?record=source-1"');
    expect(html).toContain("Source record · 35 Adams Avenue");
  });
});
