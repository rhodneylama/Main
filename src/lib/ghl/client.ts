import { getGhlConfig } from "./config";

/**
 * Minimal client for the GoHighLevel v2 API. Only the read endpoints the
 * dashboard needs are wrapped; everything else can go through `ghlRequest`.
 *
 * Docs: https://highlevel.stoplight.io/docs/integrations
 */
const BASE_URL = process.env.GHL_API_BASE ?? "https://services.leadconnectorhq.com";

/** The API version header GoHighLevel requires on every v2 request. */
const API_VERSION = "2021-07-28";

export class GhlError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GhlError";
  }
}

export async function ghlRequest<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const token = init.token ?? getGhlConfig().apiToken;
  if (!token) throw new GhlError("No GoHighLevel API token configured", 401);

  const res = await fetch(path.startsWith("http") ? path : `${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: API_VERSION,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GhlError(
      `GoHighLevel ${res.status} on ${path}${body ? `: ${body.slice(0, 300)}` : ""}`,
      res.status,
    );
  }

  return (await res.json()) as T;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface GhlPipelineResponse {
  pipelines?: any[];
}

export interface GhlUsersResponse {
  users?: any[];
}

export interface GhlOpportunitiesResponse {
  opportunities?: any[];
  meta?: { nextPageUrl?: string | null; startAfterId?: string; startAfter?: number; total?: number };
}

export function fetchPipelines(locationId: string, token?: string) {
  return ghlRequest<GhlPipelineResponse>(
    `/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`,
    { token },
  );
}

export function fetchUsers(locationId: string, token?: string) {
  return ghlRequest<GhlUsersResponse>(`/users/?locationId=${encodeURIComponent(locationId)}`, {
    token,
  });
}

/**
 * Opportunities are paged with an opaque cursor. `maxPages` caps a sync so a
 * large location can't spin forever on a first connection.
 */
export async function fetchOpportunities(
  locationId: string,
  opts: { token?: string; maxPages?: number; pageSize?: number } = {},
): Promise<any[]> {
  const pageSize = opts.pageSize ?? 100;
  const maxPages = opts.maxPages ?? 20;
  const all: any[] = [];

  let url: string | null =
    `/opportunities/search?location_id=${encodeURIComponent(locationId)}&limit=${pageSize}`;

  for (let page = 0; page < maxPages && url; page++) {
    const data: GhlOpportunitiesResponse = await ghlRequest<GhlOpportunitiesResponse>(url, {
      token: opts.token,
    });
    const batch = data.opportunities ?? [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    url = data.meta?.nextPageUrl ?? null;
  }

  return all;
}

/** Cheap credential check for the Settings screen's "Test connection" button. */
export async function testConnection(
  locationId: string,
  token: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const data = await fetchPipelines(locationId, token);
    const count = data.pipelines?.length ?? 0;
    return { ok: true, message: `Connected. Found ${count} pipeline${count === 1 ? "" : "s"}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Connection failed" };
  }
}
