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
export type MapPointPrecision = "source" | "approximate";
export type DisplayMapPoint = MapRecord & {
  displayLatitude: number;
  displayLongitude: number;
  precision: MapPointPrecision;
  area: string | null;
};
export type MapPointGroup = {
  latitude: number;
  longitude: number;
  precision: MapPointPrecision;
  area: string | null;
  points: DisplayMapPoint[];
};

type AreaCenter = {area: string; latitude: number; longitude: number};

// These centers cover the municipality names emitted by the current automated
// collectors and Hauppauge, the first supported hamlet. They are display hints,
// not project coordinates, and should grow only when a collector adds an area.
const LONG_ISLAND_AREA_CENTERS: readonly AreaCenter[] = Object.freeze([
  {area: "Babylon", latitude: 40.6957, longitude: -73.3257},
  {area: "Brookhaven", latitude: 40.7793, longitude: -72.9154},
  {area: "East Hampton", latitude: 40.9634, longitude: -72.1848},
  {area: "Farmingdale", latitude: 40.7326, longitude: -73.4454},
  {area: "Garden City", latitude: 40.7268, longitude: -73.6343},
  {area: "Glen Cove", latitude: 40.8623, longitude: -73.6337},
  {area: "Hauppauge", latitude: 40.8257, longitude: -73.2026},
  {area: "Hempstead", latitude: 40.7062, longitude: -73.6187},
  {area: "Huntington", latitude: 40.8682, longitude: -73.4257},
  {area: "Islandia", latitude: 40.8043, longitude: -73.1690},
  {area: "Islip", latitude: 40.7298, longitude: -73.2104},
  {area: "Long Beach", latitude: 40.5884, longitude: -73.6579},
  {area: "Massapequa Park", latitude: 40.6807, longitude: -73.4551},
  {area: "North Hempstead", latitude: 40.7968, longitude: -73.6772},
  {area: "Northport", latitude: 40.9009, longitude: -73.3432},
  {area: "Oyster Bay", latitude: 40.8657, longitude: -73.5321},
  {area: "Riverhead", latitude: 40.9170, longitude: -72.6620},
  {area: "Shelter Island", latitude: 41.0682, longitude: -72.3387},
  {area: "Smithtown", latitude: 40.8559, longitude: -73.2007},
  {area: "Southampton", latitude: 40.8843, longitude: -72.3895},
  {area: "Southold", latitude: 41.0648, longitude: -72.4262},
]);

const normalize = (value: string) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const normalizedCenters = LONG_ISLAND_AREA_CENTERS.map(center => ({
  ...center,
  key: normalize(center.area),
})).sort((left, right) => right.key.length - left.key.length);

function supportedCounty(county: string) {
  const key = normalize(county).replace(/ county$/, "");
  return key === "nassau" || key === "suffolk";
}

function matchTown(town: string): AreaCenter | null {
  const key = normalize(town).replace(/^(?:(?:incorporated|inc) )?(?:town|village|city|hamlet) of /, "");
  return normalizedCenters.find(center => center.key === key) ?? null;
}

function matchAddress(address: string): AreaCenter | null {
  const segments = address.split(",").map(normalize).filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index].replace(/^(?:town|village|city|hamlet) of /, "");
    const match = normalizedCenters.find(center => segment === center.key || segment.startsWith(`${center.key} ny `));
    if (match) return match;
  }

  // Some source locations are one descriptive line. The last named area is
  // most likely the locality, after street and intersection names.
  const line = ` ${normalize(address)} `;
  let best: {center: AreaCenter; index: number} | null = null;
  for (const center of normalizedCenters) {
    const index = line.lastIndexOf(` ${center.key} `);
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

/** Group by screen cells while keeping source and approximate points separate. */
export function groupMapPoints(records: readonly MapRecord[], project: (lat: number, lng: number) => {x: number; y: number}): MapPointGroup[] {
  const groups = new Map<string, MapPointGroup>();
  for (const point of buildMapPoints(records)) {
    const pixel = project(point.displayLatitude, point.displayLongitude);
    const areaKey = point.precision === "approximate" ? `:${normalize(point.area ?? "")}` : "";
    const key = `${point.precision}${areaKey}:${Math.floor(pixel.x / 48)}:${Math.floor(pixel.y / 48)}`;
    const group = groups.get(key) ?? {
      latitude: point.displayLatitude,
      longitude: point.displayLongitude,
      precision: point.precision,
      area: point.area,
      points: [],
    };
    group.points.push(point);
    if (group.precision === "source") {
      group.latitude = group.points.reduce((sum, item) => sum + item.displayLatitude, 0) / group.points.length;
      group.longitude = group.points.reduce((sum, item) => sum + item.displayLongitude, 0) / group.points.length;
    }
    groups.set(key, group);
  }
  return [...groups.values()];
}
