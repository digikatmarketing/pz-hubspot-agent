/**
 * HubSpot HTTP client with token-bucket rate limiting & auto-retry.
 * Pattern reused from pz-migration-tool/lib/hubspot-client.js
 */

import type {
  SearchRequest,
  SearchResponse,
  HubSpotObject,
  AssociationResponse,
} from "./types.js";

// ── Config ───────────────────────────────────────────────────────────

const BASE_URL = "https://api.hubapi.com";
const RATE_LIMIT_PER_SEC = 12;           // Conservative (HubSpot = 15/sec)
const BATCH_SIZE = 100;
const RETRY_DELAYS = [1000, 5000, 15000]; // Exponential backoff for 5xx

// ── Token-bucket rate limiter ────────────────────────────────────────

let tokenBucket = RATE_LIMIT_PER_SEC;
let lastRefill = Date.now();

function refillBucket(): void {
  const now = Date.now();
  const elapsed = now - lastRefill;
  const tokensToAdd = (elapsed / 1000) * RATE_LIMIT_PER_SEC;
  tokenBucket = Math.min(RATE_LIMIT_PER_SEC, tokenBucket + tokensToAdd);
  lastRefill = now;
}

async function waitForToken(): Promise<void> {
  refillBucket();
  if (tokenBucket < 1) {
    const waitMs = ((1 - tokenBucket) / RATE_LIMIT_PER_SEC) * 1000;
    await sleep(Math.ceil(waitMs) + 10);
    refillBucket();
  }
  tokenBucket -= 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Core request function ────────────────────────────────────────────

function getToken(): string {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN env var not set");
  return token;
}

export async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  retryCount = 0,
): Promise<T> {
  await waitForToken();

  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  // 2xx — success
  if (res.ok) {
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  // 429 — rate limited
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "1", 10) * 1000;
    console.warn(`  [HS] Rate limited, waiting ${retryAfter}ms...`);
    await sleep(retryAfter);
    return request<T>(method, path, body, retryCount);
  }

  // 5xx — server error, retry with backoff
  if (res.status >= 500 && retryCount < RETRY_DELAYS.length) {
    const delay = RETRY_DELAYS[retryCount];
    console.warn(`  [HS] Server error ${res.status}, retrying in ${delay}ms...`);
    await sleep(delay);
    return request<T>(method, path, body, retryCount + 1);
  }

  // Everything else — throw
  const errorBody = await res.text().catch(() => "");
  let message: string;
  try {
    const parsed = JSON.parse(errorBody);
    message = parsed.message ?? errorBody;
  } catch {
    message = errorBody;
  }
  throw new Error(`HubSpot ${res.status} ${method} ${path}: ${message}`);
}

// ── Convenience methods ──────────────────────────────────────────────

export async function getObject(
  objectType: string,
  objectId: string,
  properties: string[] = [],
): Promise<HubSpotObject> {
  let path = `/crm/v3/objects/${objectType}/${objectId}`;
  if (properties.length > 0) {
    path += `?properties=${properties.join(",")}`;
  }
  return request<HubSpotObject>("GET", path);
}

export async function createObject(
  objectType: string,
  properties: Record<string, string>,
): Promise<HubSpotObject> {
  return request<HubSpotObject>(
    "POST",
    `/crm/v3/objects/${objectType}`,
    { properties },
  );
}

export async function createAssociation(
  fromType: string,
  fromId: string,
  toType: string,
  toId: string,
  associationCategory: string,
  associationTypeId: number,
): Promise<void> {
  await request<unknown>(
    "PUT",
    `/crm/v4/objects/${fromType}/${fromId}/associations/${toType}/${toId}`,
    [{ associationCategory, associationTypeId }],
  );
}

export async function updateObject(
  objectType: string,
  objectId: string,
  properties: Record<string, string>,
): Promise<HubSpotObject> {
  return request<HubSpotObject>(
    "PATCH",
    `/crm/v3/objects/${objectType}/${objectId}`,
    { properties },
  );
}

export async function searchObjects(
  objectType: string,
  req: SearchRequest,
): Promise<SearchResponse> {
  return request<SearchResponse>(
    "POST",
    `/crm/v3/objects/${objectType}/search`,
    {
      filterGroups: req.filterGroups ?? [],
      properties: req.properties ?? [],
      limit: req.limit ?? 10,
      ...(req.after ? { after: req.after } : {}),
      ...(req.sorts ? { sorts: req.sorts } : {}),
      ...(req.query ? { query: req.query } : {}),
    },
  );
}

export async function getAssociations(
  fromType: string,
  fromId: string,
  toType: string,
  limit = 100,
): Promise<AssociationResponse> {
  return request<AssociationResponse>(
    "GET",
    `/crm/v4/objects/${fromType}/${fromId}/associations/${toType}?limit=${limit}`,
  );
}

// ── Batch helpers ────────────────────────────────────────────────────

export async function batchRead(
  objectType: string,
  ids: string[],
  properties: string[] = [],
): Promise<HubSpotObject[]> {
  const results: HubSpotObject[] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const res = await request<{ results: HubSpotObject[] }>(
      "POST",
      `/crm/v3/objects/${objectType}/batch/read`,
      {
        inputs: batch.map((id) => ({ id })),
        properties,
      },
    );
    results.push(...(res.results ?? []));
  }
  return results;
}

export async function batchUpdate(
  objectType: string,
  inputs: Array<{ id: string; properties: Record<string, string> }>,
): Promise<HubSpotObject[]> {
  const results: HubSpotObject[] = [];
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);
    const res = await request<{ results: HubSpotObject[] }>(
      "POST",
      `/crm/v3/objects/${objectType}/batch/update`,
      { inputs: batch },
    );
    results.push(...(res.results ?? []));
  }
  return results;
}
