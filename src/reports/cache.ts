/**
 * Simple in-memory TTL cache for report data.
 * Default TTL: 12 hours — reports are expensive (many paginated API calls),
 * so we cache aggressively. A cron refreshes every 12 hours.
 * Hit "Refresh" in the UI to force a fresh pull.
 */

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

interface CacheEntry {
  data: unknown;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache(key: string, data: unknown, ttlMs = DEFAULT_TTL_MS): void {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

export function clearCache(): void {
  cache.clear();
}

/** Build a cache key from report ID and date range */
export function cacheKey(reportId: string, rangeKey: string): string {
  return `report:${reportId}:${rangeKey}`;
}

/** Clear all report caches matching a prefix (e.g. "report:exec_") */
export function clearCacheByPrefix(prefix: string): number {
  let cleared = 0;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      cleared++;
    }
  }
  return cleared;
}

/** Get all non-expired cache entries matching a prefix */
export function getAllCached<T>(prefix: string): Array<{ key: string; data: T }> {
  const results: Array<{ key: string; data: T }> = [];
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (key.startsWith(prefix) && now <= entry.expires) {
      results.push({ key, data: entry.data as T });
    }
  }
  return results;
}

/** Return total cache entry count and their keys (for diagnostics) */
export function cacheStats(): { count: number; keys: string[] } {
  const now = Date.now();
  const keys: string[] = [];
  for (const [key, entry] of cache.entries()) {
    if (now <= entry.expires) keys.push(key);
  }
  return { count: keys.length, keys };
}
