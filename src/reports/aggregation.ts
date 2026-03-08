/**
 * Aggregation engine — paginated sums, counts, and monthly breakdowns.
 * HubSpot Search API has no server-side aggregation, so we paginate and compute client-side.
 */

import { searchObjects } from "../hubspot/client.js";
import type { FilterGroup, SearchFilter } from "../hubspot/types.js";
import { getMonthlyBuckets, toHsTimestamp, type DateRange } from "./date-ranges.js";

// ── Count (single API call using res.total) ─────────────────────────

export async function aggregateCount(
  objectType: string,
  filterGroups: FilterGroup[],
): Promise<number> {
  const res = await searchObjects(objectType, {
    filterGroups,
    limit: 1,
    properties: ["hs_object_id"],
  });
  return res.total;
}

// ── Sum (paginate through all results) ──────────────────────────────

export async function aggregateSum(
  objectType: string,
  filterGroups: FilterGroup[],
  property: string,
  maxPages = 50,
): Promise<{ sum: number; count: number }> {
  let sum = 0;
  let count = 0;
  let after: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    try {
      const res = await searchObjects(objectType, {
        filterGroups,
        properties: [property],
        limit: 200,
        ...(after ? { after } : {}),
      });

      for (const obj of res.results) {
        const val = parseFloat(obj.properties[property] ?? "0");
        if (!isNaN(val)) {
          sum += val;
          count++;
        }
      }

      if (!res.paging?.next?.after) break;
      after = res.paging.next.after;
    } catch (err: any) {
      // HubSpot caps pagination at 10,000 results — return what we have
      if (err.message?.includes("400")) break;
      throw err;
    }
  }

  return { sum, count };
}

// ── Monthly breakdown (parallel queries per month) ──────────────────

export interface MonthlyDataPoint {
  month: string;    // e.g. "Jan 2025"
  count: number;
  sum?: number;
}

export async function monthlyBreakdown(
  objectType: string,
  baseFilters: SearchFilter[],
  dateProperty: string,
  range: DateRange,
  options?: {
    valueProperty?: string;  // If set, also compute sum of this property
  },
): Promise<MonthlyDataPoint[]> {
  const buckets = getMonthlyBuckets(range.from, range.to);

  // Run all month queries in parallel (rate limiter handles throttling)
  const results = await Promise.all(
    buckets.map(async (bucket) => {
      const filters: SearchFilter[] = [
        ...baseFilters,
        { propertyName: dateProperty, operator: "GTE", value: toHsTimestamp(bucket.from) },
        { propertyName: dateProperty, operator: "LTE", value: toHsTimestamp(bucket.to) },
      ];

      if (options?.valueProperty) {
        // Need to paginate for sum
        const { sum, count } = await aggregateSum(
          objectType,
          [{ filters }],
          options.valueProperty,
          20, // Max 20 pages per month
        );
        return { month: bucket.label, count, sum };
      } else {
        // Just need count
        const count = await aggregateCount(objectType, [{ filters }]);
        return { month: bucket.label, count };
      }
    }),
  );

  return results;
}

// ── Group by property (paginate and count occurrences) ───────────────

export interface GroupByResult {
  value: string;
  label: string;
  count: number;
}

export async function groupByProperty(
  objectType: string,
  filterGroups: FilterGroup[],
  property: string,
  labelMap?: Record<string, string>,
  maxPages = 25,
): Promise<GroupByResult[]> {
  const counts = new Map<string, number>();
  let after: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const res = await searchObjects(objectType, {
      filterGroups,
      properties: [property],
      limit: 200,
      ...(after ? { after } : {}),
    });

    for (const obj of res.results) {
      const val = obj.properties[property] ?? "(empty)";
      counts.set(val, (counts.get(val) ?? 0) + 1);
    }

    if (!res.paging?.next?.after) break;
    after = res.paging.next.after;
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label: labelMap?.[value] ?? value,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

// ── Group by property with sum (paginate, count + sum per group) ────

export interface GroupBySumResult {
  value: string;
  label: string;
  count: number;
  sum: number;
}

export async function groupByPropertyWithSum(
  objectType: string,
  filterGroups: FilterGroup[],
  groupProperty: string,
  sumProperty: string,
  labelMap?: Record<string, string>,
  maxPages = 50,
): Promise<GroupBySumResult[]> {
  const groups = new Map<string, { count: number; sum: number }>();
  let after: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    try {
      const res = await searchObjects(objectType, {
        filterGroups,
        properties: [groupProperty, sumProperty],
        limit: 200,
        ...(after ? { after } : {}),
      });

      for (const obj of res.results) {
        const key = obj.properties[groupProperty] ?? "(empty)";
        const val = parseFloat(obj.properties[sumProperty] ?? "0");
        const existing = groups.get(key) ?? { count: 0, sum: 0 };
        existing.count++;
        if (!isNaN(val)) existing.sum += val;
        groups.set(key, existing);
      }

      if (!res.paging?.next?.after) break;
      after = res.paging.next.after;
    } catch (err: any) {
      // HubSpot caps pagination at 10,000 results — return what we have
      if (err.message?.includes("400")) break;
      throw err;
    }
  }

  return Array.from(groups.entries())
    .map(([value, { count, sum }]) => ({
      value,
      label: labelMap?.[value] ?? value,
      count,
      sum,
    }))
    .sort((a, b) => b.sum - a.sum);
}
