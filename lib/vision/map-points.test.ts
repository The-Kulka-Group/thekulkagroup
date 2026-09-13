import {describe, expect, it} from "vitest";

import {buildMapPoint, groupMapPoints, type MapRecord} from "./map-points";

const record = (overrides: Partial<MapRecord> = {}): MapRecord => ({
  id: "record-1",
  name: "Test record",
  address: "",
  town: "",
  county: "Suffolk",
  latitude: null,
  longitude: null,
  ...overrides,
});

describe("Vision map point builder", () => {
  it("uses source coordinates before an area fallback", () => {
    expect(buildMapPoint(record({
      address: "35 Adams Avenue, Hauppauge, NY",
      town: "Town of Smithtown",
      latitude: 40.81,
      longitude: -73.19,
    }))).toMatchObject({
      displayLatitude: 40.81,
      displayLongitude: -73.19,
      precision: "source",
      area: null,
    });
  });

  it("places the 35 Adams Avenue record at the Hauppauge area center", () => {
    const source = record({
      name: "Columbia Industrial Acquisition Company, LLC",
      address: "E/S of Adams Avenue (#35), 220' s/o New Highway, Hauppauge, NY",
      town: "Town of Smithtown",
    });
    expect(buildMapPoint(source)).toMatchObject({
      latitude: null,
      longitude: null,
      displayLatitude: 40.8257,
      displayLongitude: -73.2026,
      precision: "approximate",
      area: "Hauppauge",
    });
    expect(source).toMatchObject({latitude: null, longitude: null});
  });

  it("recognizes an area and state in a single address segment", () => {
    expect(buildMapPoint(record({address: "Hauppauge NY 11788", town: "Town of Smithtown"}))).toMatchObject({
      precision: "approximate",
      area: "Hauppauge",
    });
  });

  it("uses an address area before a broader town", () => {
    expect(buildMapPoint(record({
      address: "64 Second Street, Garden City, NY",
      town: "Town of Hempstead",
      county: "Nassau",
    }))).toMatchObject({precision: "approximate", area: "Garden City"});
  });

  it.each([
    ["Town of Smithtown", "Smithtown"],
    ["Village of Islandia", "Islandia"],
    ["Inc. Village of Northport", "Northport"],
  ])("resolves the prefixed town %s", (town, area) => {
    expect(buildMapPoint(record({town}))).toMatchObject({precision: "approximate", area});
  });

  it("keeps county-only and unknown records unmapped", () => {
    expect(buildMapPoint(record({town: "Suffolk County", address: "Suffolk County"}))).toBeNull();
    expect(buildMapPoint(record({town: "Unknown Place", address: "100 Unlisted Road"}))).toBeNull();
  });
});

describe("Vision map grouping", () => {
  it("keeps every located record, including applications at one area center", () => {
    const records = [
      record({id: "a", town: "Village of Islandia"}),
      record({id: "b", town: "Islandia"}),
      record({id: "missing", town: "Unknown Place"}),
    ];
    const groups = groupMapPoints(records, (latitude, longitude) => ({x: latitude, y: longitude}));

    expect(groups).toHaveLength(1);
    expect(groups[0].points.map(point => point.id)).toEqual(["a", "b"]);
    expect(groups[0]).toMatchObject({precision: "approximate", area: "Islandia"});
  });

  it("separates source and approximate records in the same screen cell", () => {
    const groups = groupMapPoints([
      record({id: "source", latitude: 40.8257, longitude: -73.2026}),
      record({id: "approximate", town: "Hauppauge"}),
    ], () => ({x: 10, y: 10}));

    expect(groups.map(group => [group.precision, group.points.map(point => point.id)])).toEqual([
      ["source", ["source"]],
      ["approximate", ["approximate"]],
    ]);
  });

  it("separates nearby source records as the map zoom increases", () => {
    const records = [
      record({id: "a", latitude: 1, longitude: 1}),
      record({id: "b", latitude: 2, longitude: 2}),
    ];
    expect(groupMapPoints(records, (latitude, longitude) => ({x: latitude, y: longitude}))).toHaveLength(1);
    expect(groupMapPoints(records, (latitude, longitude) => ({x: latitude * 100, y: longitude * 100}))).toHaveLength(2);
  });
});
