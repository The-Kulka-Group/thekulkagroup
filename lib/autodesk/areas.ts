import type { Db } from "@/lib/db";

import { accessToken } from "./connection";
import type { UserSettings } from "./oauth";

// LA-2894. Calls ACC as the connected person. The readout asks each area of one
// project whether it answers and how many records it holds, the same list the
// app-only check of 10 Gordon Drive used on 2026-10-20. It returns counts and
// statuses only and stores nothing.

const API = "https://developer.api.autodesk.com";
const LIMIT = 100;
// Reviews refuses a page larger than 50.
const REVIEWS_LIMIT = 50;
const AT_ONCE = 6;

export type AreaCall = { area: string; method: "GET" | "POST"; path: string; body?: unknown; limit?: number };

export type AreaResult = {
  area: string;
  status: number;
  answers: boolean;
  /** The total Autodesk reports, or the rows on the first page when it reports none. */
  records: number | null;
  /** True when the count is one full page with no total, so there are likely more. */
  more: boolean;
  /** Autodesk's own short reason when the area refused. */
  reason: string | null;
};

export function accAccountId(): string | null {
  return process.env.ACC_ACCOUNT_ID?.trim().replace(/^b\./, "") || null;
}

/** One ACC call as the connected person: the status and parsed body. */
export async function callAsUser(
  db: Db,
  settings: UserSettings,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<{ status: number; payload: unknown }> {
  const bearer = await accessToken(db, settings);
  return send(bearer, method, path, body);
}

async function send(bearer: string, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { Authorization: `Bearer ${bearer}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  try {
    const response = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const text = await response.text();
    let payload: unknown = text;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      // Left as text; reasonFrom shortens it.
    }
    return { status: response.status, payload };
  } catch {
    return { status: 0, payload: "Autodesk could not be reached." };
  }
}

function rowsFrom(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["results", "data", "items", "rfis"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
    return [payload];
  }
  return [];
}

function totalFrom(payload: unknown): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const page = (record.pagination ?? record.meta) as Record<string, unknown> | undefined;
  for (const key of ["totalResults", "totalCount", "total"]) {
    if (typeof page?.[key] === "number") return page[key] as number;
  }
  return null;
}

function reasonFrom(payload: unknown, bearer: string): string {
  let reason = "";
  if (typeof payload === "string") reason = payload;
  else if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const errors = Array.isArray(record.errors) ? (record.errors[0] as Record<string, unknown> | undefined) : undefined;
    const found = [record.detail, record.developerMessage, record.message, record.title, record.reason, errors?.detail, errors?.title]
      .find((value) => typeof value === "string" && value.trim());
    reason = typeof found === "string" ? found : "";
  }
  // Belt and braces: an error text never carries the bearer back out.
  return reason.split(bearer).join("[token]").replace(/\s+/g, " ").trim().slice(0, 160);
}

/** The areas of one ACC project, as the 2026-10-20 check called them. */
export function projectAreas(accountId: string, projectId: string, costContainer: string): AreaCall[] {
  const p = encodeURIComponent(projectId);
  const a = encodeURIComponent(accountId);
  const c = encodeURIComponent(costContainer);
  const hub = `b.${a}`;
  const dm = `b.${p}`;
  const page = (limit = LIMIT) => `limit=${limit}`;
  return [
    { area: "Project Details", method: "GET", path: `/construction/admin/v1/projects/${p}` },
    { area: "Project Users", method: "GET", path: `/construction/admin/v1/projects/${p}/users?limit=200`, limit: 200 },
    { area: "Project Companies", method: "GET", path: `/construction/admin/v1/projects/${p}/companies?limit=200`, limit: 200 },
    { area: "Project Companies (HQ)", method: "GET", path: `/hq/v1/accounts/${a}/projects/${p}/companies` },
    { area: "Issues", method: "GET", path: `/construction/issues/v1/projects/${p}/issues?${page()}` },
    { area: "Issue Types", method: "GET", path: `/construction/issues/v1/projects/${p}/issue-types` },
    { area: "RFIs v2", method: "GET", path: `/construction/rfis/v2/projects/${p}/rfis?${page()}` },
    { area: "RFIs v3 Search", method: "POST", path: `/construction/rfis/v3/projects/${p}/search:rfis`, body: { limit: LIMIT } },
    { area: "Submittal Items", method: "GET", path: `/construction/submittals/v2/projects/${p}/items?${page()}` },
    { area: "Submittal Specs", method: "GET", path: `/construction/submittals/v2/projects/${p}/specs?${page()}` },
    { area: "Sheets", method: "GET", path: `/construction/sheets/v1/projects/${p}/sheets?${page()}` },
    { area: "Forms", method: "GET", path: `/construction/forms/v1/projects/${p}/forms?${page()}` },
    { area: "Form Templates", method: "GET", path: `/construction/forms/v1/projects/${p}/form-templates?${page()}` },
    { area: "Photos", method: "POST", path: `/construction/photos/v1/projects/${p}/photos:filter`, body: { limit: LIMIT } },
    { area: "Assets", method: "GET", path: `/construction/assets/v2/projects/${p}/assets?${page()}` },
    { area: "Locations", method: "GET", path: `/construction/locations/v2/projects/${p}/trees/default/nodes?${page()}` },
    { area: "Reviews", method: "GET", path: `/construction/reviews/v1/projects/${p}/reviews?${page(REVIEWS_LIMIT)}`, limit: REVIEWS_LIMIT },
    { area: "Transmittals", method: "GET", path: `/construction/transmittals/v1/projects/${p}/transmittals?${page()}` },
    { area: "Cost Budgets", method: "GET", path: `/cost/v1/containers/${c}/budgets?${page()}` },
    { area: "Cost Main Contracts", method: "GET", path: `/cost/v1/containers/${c}/main-contracts?${page()}` },
    { area: "Cost Contracts", method: "GET", path: `/cost/v1/containers/${c}/contracts?${page()}` },
    { area: "Cost Items", method: "GET", path: `/cost/v1/containers/${c}/cost-items?${page()}` },
    { area: "Change Orders PCO", method: "GET", path: `/cost/v1/containers/${c}/change-orders/pco?${page()}` },
    { area: "Change Orders RCO", method: "GET", path: `/cost/v1/containers/${c}/change-orders/rco?${page()}` },
    { area: "Change Orders OCO", method: "GET", path: `/cost/v1/containers/${c}/change-orders/oco?${page()}` },
    { area: "Change Orders SCO", method: "GET", path: `/cost/v1/containers/${c}/change-orders/sco?${page()}` },
    { area: "Cost Expenses", method: "GET", path: `/cost/v1/containers/${c}/expenses?${page()}` },
    { area: "Cost Payments", method: "GET", path: `/cost/v1/containers/${c}/payments?${page()}` },
    { area: "Docs Top Folders", method: "GET", path: `/project/v1/hubs/${hub}/projects/${dm}/topFolders` },
    { area: "Data Connector Requests", method: "GET", path: `/data-connector/v1/accounts/${a}/requests?limit=10`, limit: 10 },
  ];
}

async function readArea(bearer: string, call: AreaCall): Promise<AreaResult> {
  let { status, payload } = await send(bearer, call.method, call.path, call.body);
  // Some areas refuse a paging parameter they do not know; the check retried bare.
  if (status === 400 && call.method === "GET" && call.path.includes("?")) {
    ({ status, payload } = await send(bearer, call.method, call.path.split("?")[0]));
  }
  if (status === 200 || status === 201) {
    const rows = rowsFrom(payload);
    const total = totalFrom(payload);
    return {
      area: call.area,
      status,
      answers: true,
      records: total ?? rows.length,
      more: total === null && rows.length >= (call.limit ?? LIMIT),
      reason: null,
    };
  }
  return { area: call.area, status, answers: false, records: null, more: false, reason: reasonFrom(payload, bearer) || null };
}

/**
 * Every area of one ACC project, as the connected person. Cost lives in its own
 * container, which the Data Management project names; the project id stands in
 * when it does not.
 */
export async function readProjectAreas(db: Db, settings: UserSettings, accountId: string, projectId: string) {
  const bearer = await accessToken(db, settings);
  const dm = await send(
    bearer,
    "GET",
    `/project/v1/hubs/b.${encodeURIComponent(accountId)}/projects/b.${encodeURIComponent(projectId)}`,
  );
  const relationships = (dm.payload as { data?: { relationships?: { cost?: { data?: { id?: unknown } } } } } | null)?.data
    ?.relationships;
  const container = typeof relationships?.cost?.data?.id === "string" ? relationships.cost.data.id : projectId;
  const calls = projectAreas(accountId, projectId, container);
  const results: AreaResult[] = [];
  for (let i = 0; i < calls.length; i += AT_ONCE) {
    results.push(...(await Promise.all(calls.slice(i, i + AT_ONCE).map((call) => readArea(bearer, call)))));
  }
  return results;
}
