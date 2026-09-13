export type MapRecord = {
  id: string;
  name: string;
  address: string;
  town: string;
  county: string;
  latitude: number | null;
  longitude: number | null;
};

export type DiscoveryMapPoint = MapRecord;
export type SourceMapPoint = MapRecord & {
  displayLatitude: number;
  displayLongitude: number;
  precision: "source";
  area: null;
};
export type ApproximateMapPoint = MapRecord & {
  displayLatitude: number;
  displayLongitude: number;
  precision: "approximate";
  area: string;
};
export type DisplayMapPoint = SourceMapPoint | ApproximateMapPoint;
export type SourceMapPointGroup = {
  latitude: number;
  longitude: number;
  points: SourceMapPoint[];
};
export type ApproximateAreaItem = {
  kind: "source-record" | "tracked";
  point: ApproximateMapPoint;
};
export type ApproximateAreaGroup = {
  area: string;
  latitude: number;
  longitude: number;
  items: ApproximateAreaItem[];
};

type AreaCenter = {area: string; latitude: number; longitude: number};

// These centers cover the municipality names emitted by the current automated
// collectors and Hauppauge, the first supported hamlet. They are display hints,
// not project coordinates, and should grow only when a collector adds an area.
const LONG_ISLAND_AREA_CENTERS: readonly AreaCenter[] = Object.freeze([
  {area: "Babylon", latitude: 40.6957, longitude: -73.3257},
  {area: "Bethpage", latitude: 40.7443, longitude: -73.4821},
  {area: "Brookhaven", latitude: 40.7793, longitude: -72.9154},
  {area: "East Hampton", latitude: 40.9634, longitude: -72.1848},
  {area: "Elwood", latitude: 40.8454, longitude: -73.3351},
  {area: "Farmingdale", latitude: 40.7326, longitude: -73.4454},
  {area: "Garden City", latitude: 40.7268, longitude: -73.6343},
  {area: "Glen Cove", latitude: 40.8623, longitude: -73.6337},
  {area: "Great Neck", latitude: 40.8007, longitude: -73.7285},
  {area: "Hauppauge", latitude: 40.8257, longitude: -73.2026},
  {area: "Hempstead", latitude: 40.7062, longitude: -73.6187},
  {area: "Huntington", latitude: 40.8682, longitude: -73.4257},
  {area: "Islandia", latitude: 40.8043, longitude: -73.1690},
  {area: "Islip", latitude: 40.7298, longitude: -73.2104},
  {area: "Jericho", latitude: 40.7920, longitude: -73.5398},
  {area: "Long Beach", latitude: 40.5884, longitude: -73.6579},
  {area: "Massapequa Park", latitude: 40.6807, longitude: -73.4551},
  {area: "Mineola", latitude: 40.7493, longitude: -73.6407},
  {area: "North Hempstead", latitude: 40.7968, longitude: -73.6772},
  {area: "Northport", latitude: 40.9009, longitude: -73.3432},
  {area: "Oceanside", latitude: 40.6387, longitude: -73.6401},
  {area: "Oyster Bay", latitude: 40.8657, longitude: -73.5321},
  {area: "Port Washington", latitude: 40.8257, longitude: -73.6982},
  {area: "Riverhead", latitude: 40.9170, longitude: -72.6620},
  {area: "Shelter Island", latitude: 41.0682, longitude: -72.3387},
  {area: "Smithtown", latitude: 40.8559, longitude: -73.2007},
  {area: "Southampton", latitude: 40.8843, longitude: -72.3895},
  {area: "Southold", latitude: 41.0648, longitude: -72.4262},
  {area: "Uniondale", latitude: 40.7004, longitude: -73.5929},
  {area: "Westbury", latitude: 40.7557, longitude: -73.5876},
]);

const normalizeAreaKey = (value: string) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const normalizedCenters = LONG_ISLAND_AREA_CENTERS.map(center => ({
  ...center,
  key: normalizeAreaKey(center.area),
})).sort((left, right) => right.key.length - left.key.length);

function supportedCounty(county: string) {
  const key = normalizeAreaKey(county).replace(/ county$/, "");
  return key === "nassau" || key === "suffolk";
}

function matchTown(town: string): AreaCenter | null {
  const key = normalizeAreaKey(town).replace(/^(?:(?:incorporated|inc) )?(?:town|village|city|hamlet) of /, "");
  return normalizedCenters.find(center => center.key === key) ?? null;
}

function matchAddress(address: string): AreaCenter | null {
  const segments = address.split(",").map(normalizeAreaKey).filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index].replace(/^(?:town|village|city|hamlet) of /, "");
    const match = normalizedCenters.find(center => segment === center.key || segment.startsWith(`${center.key} ny `));
    if (match) return match;
  }

  // Descriptive source lines must label the locality. A bare area name can be
  // a road name, such as Jericho Turnpike, and is not enough for a fallback.
  const line = ` ${normalizeAreaKey(address)} `;
  let best: {center: AreaCenter; index: number} | null = null;
  for (const center of normalizedCenters) {
    const markers = ["hamlet", "village", "town", "city"].map(type => ` ${type} of ${center.key} `);
    const index = Math.max(...markers.map(marker => line.lastIndexOf(marker)));
    if (index >= 0 && (!best || index > best.index)) best = {center, index};
  }
  return best?.center ?? null;
}

/** Build a display-only point without changing the source or saved record. */
export function buildMapPoint(record: MapRecord): DisplayMapPoint | null {
  if (record.latitude !== null && record.longitude !== null && Number.isFinite(record.latitude) && Number.isFinite(record.longitude)) {
    return {...record, displayLatitude: record.latitude, displayLongitude: record.longitude, precision: "source", area: null};
  }
  if (!supportedCounty(record.county)) return null;
  const center = matchAddress(record.address) ?? matchTown(record.town);
  if (!center) return null;
  return {...record, displayLatitude: center.latitude, displayLongitude: center.longitude, precision: "approximate", area: center.area};
}

export function buildMapPoints(records: readonly MapRecord[]) {
  return records.flatMap(record => {
    const point = buildMapPoint(record);
    return point ? [point] : [];
  });
}

export function partitionMapPoints(records: readonly MapRecord[]) {
  const source: SourceMapPoint[] = [];
  const approximate: ApproximateMapPoint[] = [];
  for (const point of buildMapPoints(records)) {
    if (point.precision === "source") source.push(point);
    else approximate.push(point);
  }
  return {source, approximate};
}

/** Group source-located records by screen cell so nearby records stay selectable. */
export function groupSourceMapPoints(points: readonly SourceMapPoint[], project: (lat: number, lng: number) => {x: number; y: number}): SourceMapPointGroup[] {
  const groups = new Map<string, SourceMapPointGroup>();
  for (const point of points) {
    const pixel = project(point.displayLatitude, point.displayLongitude);
    const key = `${Math.floor(pixel.x / 48)}:${Math.floor(pixel.y / 48)}`;
    const group = groups.get(key) ?? {
      latitude: point.displayLatitude,
      longitude: point.displayLongitude,
      points: [],
    };
    group.points.push(point);
    group.latitude = group.points.reduce((sum, item) => sum + item.displayLatitude, 0) / group.points.length;
    group.longitude = group.points.reduce((sum, item) => sum + item.displayLongitude, 0) / group.points.length;
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Keep one approximate marker per named area, across both record types. */
export function groupApproximateAreaPoints(items: readonly ApproximateAreaItem[]): ApproximateAreaGroup[] {
  const groups = new Map<string, ApproximateAreaGroup>();
  for (const item of items) {
    const key = normalizeAreaKey(item.point.area);
    const group = groups.get(key) ?? {
      area: item.point.area,
      latitude: item.point.displayLatitude,
      longitude: item.point.displayLongitude,
      items: [],
    };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}
