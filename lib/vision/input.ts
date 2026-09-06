import type { VisionDraft, VisionFilters, VisionReview, VisionStatus } from "./types";

export class InvalidVisionInput extends Error {}
const statuses = ["open", "working", "stuck", "done"];
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvalidVisionInput("Send an opportunity object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number, required = false) {
  if (value === undefined && !required) return "";
  if (typeof value !== "string" || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new InvalidVisionInput(`${label} must be text with at most ${max} characters.`);
  if (required && !value.trim()) throw new InvalidVisionInput(`${label} is required.`);
  return value.trim();
}
export function safeSourceUrl(value: unknown) {
  const raw = text(value, "Source URL", 2048, true);
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.href;
  } catch { throw new InvalidVisionInput("Source URL must be an HTTP or HTTPS link without credentials."); }
}
function sourceDate(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") throw new InvalidVisionInput("Source date must be a valid date.");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new InvalidVisionInput("Source date must be a valid date.");
  return value;
}
function coordinate(value: unknown, limit: number, label: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > limit) throw new InvalidVisionInput(`${label} must be between ${-limit} and ${limit}.`);
  return value;
}
export function parseVisionDraft(value: unknown): VisionDraft {
  const body = object(value);
  const latitude = coordinate(body.latitude, 90, "Latitude");
  const longitude = coordinate(body.longitude, 180, "Longitude");
  if ((latitude === null) !== (longitude === null)) throw new InvalidVisionInput("Enter both latitude and longitude, or leave both blank.");
  return {
    name: text(body.name, "Opportunity name", 200, true), town: text(body.town, "Town", 120, true),
    county: text(body.county, "County", 120, true), address: text(body.address, "Address", 400),
    latitude, longitude, sourceTitle: text(body.sourceTitle, "Source title", 300, true),
    sourceUrl: safeSourceUrl(body.sourceUrl), sourceDate: sourceDate(body.sourceDate), notes: text(body.notes, "Notes", 10000),
  };
}
export function parseVisionReview(value: unknown): VisionReview {
  const body = object(value);
  if (typeof body.notes !== "string") throw new InvalidVisionInput("Send the current notes with your review.");
  if (typeof body.status !== "string" || !statuses.includes(body.status)) throw new InvalidVisionInput("Choose a valid review status.");
  if (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 1) throw new InvalidVisionInput("Send the current opportunity revision.");
  return { status: body.status as VisionStatus, notes: text(body.notes, "Notes", 10000, false), expectedRevision: Number(body.expectedRevision) };
}
export function parseVisionFilters(params: URLSearchParams): VisionFilters {
  const status = params.get("status") || undefined;
  if (status && !statuses.includes(status)) throw new InvalidVisionInput("Choose a valid review status.");
  return { search: text(params.get("search") ?? "", "Search", 200), county: text(params.get("county") ?? "", "County", 120), status: status as VisionStatus | undefined };
}

export function parseVisionLocation(value: unknown) {
  const body = object(value);
  if (Object.keys(body).some(key => !["address", "latitude", "longitude", "expectedRevision"].includes(key))) throw new InvalidVisionInput("Send only the address, coordinates and current revision.");
  if (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 1) throw new InvalidVisionInput("Send the current opportunity revision.");
  if (!("latitude" in body) || !("longitude" in body) || typeof body.address !== "string") throw new InvalidVisionInput("Send the address and both coordinates, or null to clear the pin.");
  const latitude = coordinate(body.latitude, 90, "Latitude");
  const longitude = coordinate(body.longitude, 180, "Longitude");
  if ((latitude === null) !== (longitude === null)) throw new InvalidVisionInput("Enter both latitude and longitude, or leave both blank.");
  return { address: text(body.address, "Address", 400), latitude, longitude, expectedRevision: Number(body.expectedRevision) };
}
export function parseLocationQuery(value: unknown) {
  return text(object(value).address, "Street address with town and state", 400, true);
}
