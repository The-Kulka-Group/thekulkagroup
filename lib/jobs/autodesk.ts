// LA-2283. Kulka's project list from the Autodesk Construction Cloud Admin API
// (GET /construction/admin/v1/accounts/:accountId/projects), read with an
// app-only (2-legged) token. Kulka's ACC account admin adds this app under
// Account Admin, Custom Integrations before any call works.

const TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const API = "https://developer.api.autodesk.com/construction/admin/v1";
const PAGE = 200;
const FIELDS = [
  "name,jobNumber,status,type,platform,city,stateOrProvince,startDate,endDate,updatedAt",
  // LA-2881
  "addressLine1,postalCode,latitude,longitude,memberCount,companyCount,sheetCount,products",
].join(",");

/** A project as the ACC Admin API returns it, with the fields requested above. */
export type AccProject = {
  id: string;
  name: string | null;
  jobNumber?: string | null;
  status?: string | null;
  type?: string | null;
  platform?: string | null;
  city?: string | null;
  stateOrProvince?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  updatedAt?: string | null;
  addressLine1?: string | null;
  postalCode?: string | null;
  // The ACC model types coordinates as strings; a number is read the same way.
  latitude?: string | number | null;
  longitude?: string | number | null;
  memberCount?: number | null;
  companyCount?: number | null;
  sheetCount?: number | null;
  products?: { key?: string; status?: string }[] | null;
};

export class AutodeskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutodeskError";
  }
}

export type AutodeskSettings = { clientId: string; clientSecret: string; accountId: string };

/** The three settings, or null when Autodesk is not set up. */
export function autodeskSettings(): AutodeskSettings | null {
  const clientId = process.env.APS_CLIENT_ID?.trim();
  const clientSecret = process.env.APS_CLIENT_SECRET?.trim();
  // The hub id from the Data Management API works too, once its "b." prefix is removed.
  const accountId = process.env.ACC_ACCOUNT_ID?.trim().replace(/^b\./, "");
  return clientId && clientSecret && accountId ? { clientId, clientSecret, accountId } : null;
}

async function token(settings: AutodeskSettings): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "account:read" }),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as { access_token?: string; developerMessage?: string } | null;
  if (!response.ok || !body?.access_token) {
    throw new AutodeskError(body?.developerMessage ?? `Autodesk sign-in answered ${response.status}.`);
  }
  return body.access_token;
}

/** Every production project in the account, all pages. */
export async function listAccProjects(settings: AutodeskSettings, max = 5000): Promise<AccProject[]> {
  const bearer = await token(settings);
  const projects: AccProject[] = [];
  for (let offset = 0; offset < max; offset += PAGE) {
    const url = new URL(`${API}/accounts/${encodeURIComponent(settings.accountId)}/projects`);
    url.searchParams.set("fields", FIELDS);
    url.searchParams.set("filter[classification]", "production");
    url.searchParams.set("limit", String(PAGE));
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` }, cache: "no-store" });
    const body = (await response.json().catch(() => null)) as {
      results?: AccProject[];
      pagination?: { totalResults?: number };
      detail?: string;
      title?: string;
    } | null;
    if (!response.ok || !Array.isArray(body?.results)) {
      throw new AutodeskError(body?.detail ?? body?.title ?? `Autodesk answered ${response.status}.`);
    }
    projects.push(...body.results);
    const total = body.pagination?.totalResults;
    if (body.results.length < PAGE || (total !== undefined && projects.length >= total)) break;
  }
  return projects;
}
