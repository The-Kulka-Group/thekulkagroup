import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import {groupApproximateAreaPoints, partitionMapPoints, type DiscoveryMapPoint} from "@/lib/vision/map-points";
import type {VisionOpportunity} from "@/lib/vision/types";
import {ApproximateAreaPopup, MapLayerControls, OpportunityMap, selectVisibleMapLayers} from "./OpportunityMap";

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
  it("renders compact layer pills with counts and clear pressed state", () => {
    const html = renderToStaticMarkup(createElement(MapLayerControls, {
      counts: {discoveries: 12, approximate: 4, tracked: 3},
      visibility: {discoveries: true, approximate: false, tracked: true},
      onToggle: vi.fn(),
    }));

    expect(html.match(/class="vision-layer-pill/g)).toHaveLength(3);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Discoveries");
    expect(html).toContain("12");
    expect(html).toContain("On");
    expect(html).toContain("Approximate areas");
    expect(html).toContain("4");
    expect(html).toContain("Off");
    expect(html).toContain("Tracked opportunities");
    expect(html).toContain("3");
  });

  it("filters discoveries, approximate areas, and tracked records independently", () => {
    const discoveryPoints = partitionMapPoints([
      discovery({id: "discovery-located", latitude: 40.8, longitude: -73.4}),
      discovery({id: "discovery-approximate", town: "Hauppauge"}),
    ]);
    const trackedPoints = partitionMapPoints([
      tracked({id: "tracked-located", latitude: 40.81, longitude: -73.41}),
      tracked({id: "tracked-approximate", town: "Hauppauge"}),
    ]);

    const cases = [
      {visibility:{discoveries:false,approximate:false,tracked:false},discoveryIds:[],approximateKinds:[],trackedIds:[]},
      {visibility:{discoveries:true,approximate:false,tracked:false},discoveryIds:["discovery-located"],approximateKinds:[],trackedIds:[]},
      {visibility:{discoveries:false,approximate:false,tracked:true},discoveryIds:[],approximateKinds:[],trackedIds:["tracked-located"]},
      {visibility:{discoveries:false,approximate:true,tracked:false},discoveryIds:[],approximateKinds:[],trackedIds:[]},
      {visibility:{discoveries:true,approximate:true,tracked:false},discoveryIds:["discovery-located"],approximateKinds:["source-record:discovery-approximate"],trackedIds:[]},
      {visibility:{discoveries:false,approximate:true,tracked:true},discoveryIds:[],approximateKinds:["tracked:tracked-approximate"],trackedIds:["tracked-located"]},
      {visibility:{discoveries:true,approximate:false,tracked:true},discoveryIds:["discovery-located"],approximateKinds:[],trackedIds:["tracked-located"]},
      {visibility:{discoveries:true,approximate:true,tracked:true},discoveryIds:["discovery-located"],approximateKinds:["tracked:tracked-approximate","source-record:discovery-approximate"],trackedIds:["tracked-located"]},
    ] as const;

    for (const item of cases) {
      const visible = selectVisibleMapLayers(discoveryPoints, trackedPoints, item.visibility);
      expect(visible.discoveries.map(point=>point.id)).toEqual(item.discoveryIds);
      expect(visible.approximate.map(entry=>`${entry.kind}:${entry.point.id}`)).toEqual(item.approximateKinds);
      expect(visible.tracked.map(point=>point.id)).toEqual(item.trackedIds);
    }
  });

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
    expect(html).not.toContain("<h2>Approximate areas</h2>");
    expect(html).toContain("Gold ≈ pills use a named area center, not a project coordinate.");
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
