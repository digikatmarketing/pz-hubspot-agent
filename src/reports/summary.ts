/**
 * Summary KPIs — always-visible metrics at the top of the reports view.
 * These are all-time totals, not date-range filtered.
 */

import { aggregateCount, aggregateSum } from "./aggregation.js";
import { ORDERS_OBJECT_TYPE } from "./constants.js";
import { PRESCRIPTIONS_OBJECT_TYPE } from "../hubspot/types.js";
import { getCached, setCache } from "./cache.js";
import { toHsTimestamp } from "./date-ranges.js";

export interface SummaryKPI {
  label: string;
  value: string;
}

const SUMMARY_CACHE_KEY = "summary_kpis";

/**
 * Build half-year date-range filter groups to stay under HubSpot's
 * 10,000-result pagination cap.  Each 6-month chunk should contain
 * well under 10K orders so aggregateSum can paginate safely.
 */
function halfYearOrderFilters(): Array<{
  filters: Array<{ propertyName: string; operator: string; value: string }>;
}> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const startYear = 2023; // Shopify sync started ~2023
  const chunks: Array<{
    filters: Array<{ propertyName: string; operator: string; value: string }>;
  }> = [];

  for (let y = startYear; y <= currentYear; y++) {
    // H1: Jan–Jun
    chunks.push({
      filters: [
        { propertyName: "hs_external_created_date", operator: "GTE", value: toHsTimestamp(new Date(y, 0, 1)) },
        { propertyName: "hs_external_created_date", operator: "LT", value: toHsTimestamp(new Date(y, 6, 1)) },
      ],
    });
    // H2: Jul–Dec (skip if we haven't reached H2 of current year yet)
    if (y < currentYear || now.getMonth() >= 6) {
      chunks.push({
        filters: [
          { propertyName: "hs_external_created_date", operator: "GTE", value: toHsTimestamp(new Date(y, 6, 1)) },
          { propertyName: "hs_external_created_date", operator: "LT", value: toHsTimestamp(new Date(y + 1, 0, 1)) },
        ],
      });
    }
  }
  return chunks;
}

export async function getSummaryKPIs(): Promise<SummaryKPI[]> {
  // Check cache
  const cached = getCached<SummaryKPI[]>(SUMMARY_CACHE_KEY);
  if (cached) return cached;

  // Use HAS_PROPERTY on hs_object_id as a "match all" filter —
  // the orders object type rejects truly empty filter arrays.
  const MATCH_ALL = [{ filters: [{ propertyName: "hs_object_id", operator: "HAS_PROPERTY" as const }] }];

  // Revenue: split into half-year chunks to avoid HubSpot's 10K pagination cap.
  // Each 6-month chunk has <10K orders so aggregateSum can safely paginate.
  const chunks = halfYearOrderFilters();
  const revenueChunks = await Promise.all(
    chunks.map((chunk) =>
      aggregateSum(ORDERS_OBJECT_TYPE, [{ filters: chunk.filters as any }], "hs_total_price", 50),
    ),
  );
  const totalRevenue = revenueChunks.reduce((s, r) => s + r.sum, 0);

  // Count queries — these just read res.total (single API call each, no pagination)
  const [patientsResult, ordersResult, activeRxResult] = await Promise.all([
    aggregateCount("contacts", [{
      filters: [
        { propertyName: "num_associated_deals", operator: "GT", value: "0" },
      ],
    }]),
    aggregateCount(ORDERS_OBJECT_TYPE, MATCH_ALL),
    aggregateCount(PRESCRIPTIONS_OBJECT_TYPE, [{
      filters: [
        { propertyName: "prescription_status", operator: "EQ", value: "ACTIVE" },
      ],
    }]),
  ]);

  const result: SummaryKPI[] = [
    {
      label: "Total Revenue",
      value: `$${totalRevenue.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
    },
    {
      label: "Total Patients",
      value: patientsResult.toLocaleString(),
    },
    {
      label: "Total Orders",
      value: ordersResult.toLocaleString(),
    },
    {
      label: "Active Rx",
      value: activeRxResult.toLocaleString(),
    },
  ];

  // Cache for 12 hours (matches report cache TTL)
  setCache(SUMMARY_CACHE_KEY, result);

  return result;
}
