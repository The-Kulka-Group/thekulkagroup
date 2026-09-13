import {describe, expect, it} from "vitest";

import {buildMapPoint, groupApproximateAreaPoints, groupSourceMapPoints, partitionMapPoints, type MapRecord} from "./map-points";

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

  it.each([
    ["Bethpage", "Nassau"],
    ["Farmingdale", "Nassau"],
    ["Garden City", "Nassau"],
    ["Glen Cove", "Nassau"],
    ["Great Neck", "Nassau"],
    ["Hempstead", "Nassau"],
    ["Jericho", "Nassau"],
    ["Massapequa Park", "Nassau"],
    ["Mineola", "Nassau"],
    ["Oceanside", "Nassau"],
    ["Port Washington", "Nassau"],
    ["Uniondale", "Nassau"],
    ["Westbury", "Nassau"],
    ["Brookhaven", "Suffolk"],
    ["Huntington", "Suffolk"],
    ["Islandia", "Suffolk"],
    ["Riverhead", "Suffolk"],
    ["Southold", "Suffolk"],
  ])("covers the automated-source fixture area %s", (area, county) => {
    expect(buildMapPoint(record({town: area, county}))).toMatchObject({precision: "approximate", area});
  });

  it("uses the Elwood hamlet named by the Suffolk fixture before its town", () => {
    expect(buildMapPoint(record({
      address: "n/s of Jericho Turnpike & 212 ft east of Manor Rd, Hamlet of Elwood",
      town: "Town of Huntington",
    }))).toMatchObject({precision: "approximate", area: "Elwood"});
  });

  it("does not treat an area name in a road as the project locality", () => {
    expect(buildMapPoint(record({
      address: "n/s of Jericho Turnpike & 212 ft east of Manor Road",
      town: "Town of Huntington",
    }))).toMatchObject({precision: "approximate", area: "Huntington"});
  });

  it("keeps county-only and unknown records unmapped", () => {
    expect(buildMapPoint(record({town: "Suffolk County", address: "Suffolk County"}))).toBeNull();
    expect(buildMapPoint(record({town: "Unknown Place", address: "100 Unlisted Road"}))).toBeNull();
  });
});

describe("Vision map grouping", () => {
  it("keeps each source-located record in its screen-cell group", () => {
    const {source} = partitionMapPoints([
      record({id: "a", latitude: 1, longitude: 1}),
      record({id: "b", latitude: 1, longitude: 1}),
      record({id: "missing", town: "Unknown Place"}),
    ]);
    const groups = groupSourceMapPoints(source, (latitude, longitude) => ({x: latitude, y: longitude}));

    expect(groups).toHaveLength(1);
    expect(groups[0].points.map(point => point.id)).toEqual(["a", "b"]);
  });

  it("puts tracked and source records for one approximate area in one group", () => {
    const {approximate} = partitionMapPoints([
      record({id: "source-record", town: "Hauppauge"}),
      record({id: "tracked", address: "35 Adams Avenue, Hauppauge, NY"}),
    ]);
    const groups = groupApproximateAreaPoints([
      {kind: "source-record", point: approximate[0]},
      {kind: "tracked", point: approximate[1]},
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({area: "Hauppauge"});
    expect(groups[0].items.map(item => [item.kind, item.point.id])).toEqual([
      ["source-record", "source-record"],
      ["tracked", "tracked"],
    ]);
  });

  it("separates nearby source records as the map zoom increases", () => {
    const records = [
      record({id: "a", latitude: 1, longitude: 1}),
      record({id: "b", latitude: 2, longitude: 2}),
    ];
    const {source} = partitionMapPoints(records);
    expect(groupSourceMapPoints(source, (latitude, longitude) => ({x: latitude, y: longitude}))).toHaveLength(1);
    expect(groupSourceMapPoints(source, (latitude, longitude) => ({x: latitude * 100, y: longitude * 100}))).toHaveLength(2);
  });
});
