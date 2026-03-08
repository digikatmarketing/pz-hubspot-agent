/**
 * Report registry — maps report IDs to functions, organises by dashboard.
 */

import type { DateRange } from "./date-ranges.js";
import { getDateRange, type DateRangeKey } from "./date-ranges.js";
import { getCached, setCache, cacheKey, clearCache, getAllCached, cacheStats } from "./cache.js";
import type { DashboardId, ChartType } from "./constants.js";
import { DASHBOARDS } from "./constants.js";

// Executive reports
import {
  execTotalRevenue,
  execRevenueByMonth,
  execAvgOrderValue,
  execNewPatients,
  execReturningPatients,
  execNewVsRenewals,
  execConversionFunnel,
  execTopProducts,
  execRevenueByState,
  execTreatmentTypes,
  execConversionRate,
  execGenderDistribution,
  execAgeBrackets,
  execPatientLTV,
} from "./executive.js";

// Operations reports
import {
  opsOrdersByStatus,
  opsOrdersOverTime,
  opsPipelineDistribution,
  opsDealsByOwner,
  opsStaleDealsSummary,
  opsAvgTimeInStage,
  opsLeadSourceBreakdown,
  opsTicketsByStatus,
  opsTicketsOverTime,
  opsFulfillmentTime,
  opsTicketsByPriority,
  opsTicketsByCategory,
  opsCancellationRate,
  opsCancellationTrend,
} from "./operations.js";

// Prescriptions reports
import {
  rxByStatus,
  rxOverTime,
  rxTopMedications,
  rxActiveCount,
  rxExpiringSoon,
  rxPerContact,
  rxDispensingRate,
} from "./prescriptions.js";

// ── Types ────────────────────────────────────────────────────────────

export interface ReportResult {
  reportId: string;
  title: string;
  chartType: ChartType;
  dateRange: { from: string; to: string; label: string };
  data: {
    labels?: string[];
    values?: number[];
    datasets?: Array<{ label: string; data: number[] }>;
    kpiValue?: string | number;
    kpiDelta?: string;
    rows?: Array<Record<string, unknown>>;
  };
  cached?: boolean;
  generatedAt?: string;
}

export interface ReportMeta {
  id: string;
  title: string;
  chartType: ChartType;
  dashboard: DashboardId;
  defaultRange: DateRangeKey;
  execute: (range: DateRange) => Promise<ReportResult>;
}

// ── Report definitions ──────────────────────────────────────────────

const reports: ReportMeta[] = [
  // Executive
  { id: "exec_total_revenue",     title: "Total Revenue",              chartType: "kpi",      dashboard: "executive",     defaultRange: "ltm",     execute: execTotalRevenue },
  { id: "exec_revenue_by_month",  title: "Revenue by Month",           chartType: "bar",      dashboard: "executive",     defaultRange: "ltm",     execute: execRevenueByMonth },
  { id: "exec_avg_order_value",   title: "Average Order Value",        chartType: "kpi",      dashboard: "executive",     defaultRange: "ltm",     execute: execAvgOrderValue },
  { id: "exec_new_patients",      title: "New Patient Applications",   chartType: "bar",      dashboard: "executive",     defaultRange: "ltm",     execute: execNewPatients },
  { id: "exec_returning_patients",title: "Returning Patients",         chartType: "kpi",      dashboard: "executive",     defaultRange: "ltm",     execute: execReturningPatients },
  { id: "exec_new_vs_renewals",   title: "New vs Repeat Customers",    chartType: "doughnut", dashboard: "executive",     defaultRange: "ltm",     execute: execNewVsRenewals },
  { id: "exec_conversion_funnel", title: "Pipeline Funnel",            chartType: "funnel",   dashboard: "executive",     defaultRange: "ltm",     execute: execConversionFunnel },
  { id: "exec_top_products",      title: "Top Products",               chartType: "table",    dashboard: "executive",     defaultRange: "ltm",     execute: execTopProducts },
  { id: "exec_revenue_by_state", title: "Revenue by State",           chartType: "bar",      dashboard: "executive",     defaultRange: "ltm",     execute: execRevenueByState },
  { id: "exec_treatment_types",  title: "Treatment Types",            chartType: "doughnut", dashboard: "executive",     defaultRange: "ltm",     execute: execTreatmentTypes },
  { id: "exec_conversion_rate",  title: "Conversion Rate",            chartType: "kpi",      dashboard: "executive",     defaultRange: "ltm",     execute: execConversionRate },
  { id: "exec_gender_distribution", title: "Gender Distribution",     chartType: "doughnut", dashboard: "executive",     defaultRange: "ltm",     execute: execGenderDistribution },
  { id: "exec_age_brackets",     title: "Patient Age Distribution",   chartType: "bar",      dashboard: "executive",     defaultRange: "ltm",     execute: execAgeBrackets },
  { id: "exec_patient_ltv",      title: "Avg Patient Lifetime Value", chartType: "kpi",      dashboard: "executive",     defaultRange: "ltm",     execute: execPatientLTV },

  // Operations
  { id: "ops_orders_by_status",   title: "Shopify Orders by Status",   chartType: "doughnut", dashboard: "operations",    defaultRange: "ltm",     execute: opsOrdersByStatus },
  { id: "ops_orders_over_time",   title: "Shopify Orders Over Time",   chartType: "line",     dashboard: "operations",    defaultRange: "ltm",     execute: opsOrdersOverTime },
  { id: "ops_pipeline_distribution", title: "Sales Pipeline",          chartType: "bar",      dashboard: "operations",    defaultRange: "ltm",     execute: opsPipelineDistribution },
  { id: "ops_deals_by_owner",     title: "Deals by Owner",             chartType: "bar",      dashboard: "operations",    defaultRange: "ltm",     execute: opsDealsByOwner },
  { id: "ops_stale_deals",        title: "Stale Deals (30+ days)",     chartType: "bar",      dashboard: "operations",    defaultRange: "ltm",     execute: opsStaleDealsSummary },
  { id: "ops_avg_time_in_stage",  title: "Avg Days in Stage",          chartType: "bar",      dashboard: "operations",    defaultRange: "ltm",     execute: opsAvgTimeInStage },
  { id: "ops_lead_source",        title: "Lead Sources",               chartType: "doughnut", dashboard: "operations",    defaultRange: "ltm",     execute: opsLeadSourceBreakdown },
  { id: "ops_tickets_by_status",  title: "Tickets by Status",          chartType: "doughnut", dashboard: "operations",    defaultRange: "ltm",     execute: opsTicketsByStatus },
  { id: "ops_tickets_over_time",  title: "Tickets Over Time",          chartType: "line",     dashboard: "operations",    defaultRange: "ltm",     execute: opsTicketsOverTime },
  { id: "ops_fulfillment_time",  title: "Avg Fulfillment Time",       chartType: "kpi",      dashboard: "operations",    defaultRange: "ltm",     execute: opsFulfillmentTime },
  { id: "ops_tickets_by_priority", title: "Tickets by Priority",      chartType: "bar",      dashboard: "operations",    defaultRange: "ltm",     execute: opsTicketsByPriority },
  { id: "ops_tickets_by_category", title: "Tickets by Category",      chartType: "doughnut", dashboard: "operations",    defaultRange: "ltm",     execute: opsTicketsByCategory },
  { id: "ops_cancellation_rate", title: "Cancellation Rate",          chartType: "kpi",      dashboard: "operations",    defaultRange: "ltm",     execute: opsCancellationRate },
  { id: "ops_cancellation_trend",title: "Cancellation Trend",         chartType: "line",     dashboard: "operations",    defaultRange: "ltm",     execute: opsCancellationTrend },

  // Prescriptions
  { id: "rx_by_status",           title: "Prescriptions by Status",    chartType: "doughnut", dashboard: "prescriptions", defaultRange: "ltm",     execute: rxByStatus },
  { id: "rx_over_time",           title: "Prescriptions Over Time",    chartType: "line",     dashboard: "prescriptions", defaultRange: "ltm",     execute: rxOverTime },
  { id: "rx_top_medications",     title: "Top Medications",            chartType: "table",    dashboard: "prescriptions", defaultRange: "ltm",     execute: rxTopMedications },
  { id: "rx_active_count",        title: "Active Prescriptions",       chartType: "kpi",      dashboard: "prescriptions", defaultRange: "ltm",     execute: rxActiveCount },
  { id: "rx_expiring_soon",       title: "Expiring Soon",              chartType: "kpi",      dashboard: "prescriptions", defaultRange: "ltm",     execute: rxExpiringSoon },
  { id: "rx_per_contact",         title: "Avg Rx per Patient",         chartType: "kpi",      dashboard: "prescriptions", defaultRange: "ltm",     execute: rxPerContact },
  { id: "rx_dispensing_rate",     title: "Dispensing Rate",            chartType: "kpi",      dashboard: "prescriptions", defaultRange: "ltm",     execute: rxDispensingRate },
];

const reportMap = new Map<string, ReportMeta>(reports.map((r) => [r.id, r]));

// ── Public API ──────────────────────────────────────────────────────

/** Clear the entire report cache (Refresh button) */
export { clearCache as clearReportCache };

/** Get metadata for all reports, grouped by dashboard */
export function listReports(): Record<DashboardId, Array<{ id: string; title: string; chartType: ChartType }>> {
  const result: Record<string, Array<{ id: string; title: string; chartType: ChartType }>> = {};
  for (const [key] of Object.entries(DASHBOARDS)) {
    result[key] = reports
      .filter((r) => r.dashboard === key)
      .map((r) => ({ id: r.id, title: r.title, chartType: r.chartType }));
  }
  return result as Record<DashboardId, Array<{ id: string; title: string; chartType: ChartType }>>;
}

/** Get reports for a specific dashboard */
export function getReportsForDashboard(dashboardId: DashboardId): ReportMeta[] {
  return reports.filter((r) => r.dashboard === dashboardId);
}

/** Run a single report with caching */
export async function runReport(
  reportId: string,
  rangeKey?: DateRangeKey,
  custom?: { from: string; to: string },
): Promise<ReportResult> {
  const meta = reportMap.get(reportId);
  if (!meta) throw new Error(`Unknown report: ${reportId}`);

  const rk = rangeKey ?? meta.defaultRange;
  const ck = cacheKey(reportId, rk, custom);

  // Check cache
  const cached = getCached<ReportResult>(ck);
  if (cached) {
    return { ...cached, cached: true };
  }

  // Run report
  const range = getDateRange(rk, custom);
  const result = await meta.execute(range);
  result.generatedAt = new Date().toISOString();
  result.cached = false;

  // Cache result
  setCache(ck, result);

  return result;
}

/** Run all reports for a dashboard — sequentially to avoid rate-limiter thrashing.
 *  Each report may need 5-20 API calls, so running them 4-at-a-time was overwhelming
 *  the 12 req/sec rate limiter. Sequential is actually faster because requests don't
 *  pile up waiting for tokens. Cached reports return instantly either way. */
export async function runDashboard(
  dashboardId: DashboardId,
  rangeKey?: DateRangeKey,
  custom?: { from: string; to: string },
): Promise<ReportResult[]> {
  const dashReports = getReportsForDashboard(dashboardId);
  const results: ReportResult[] = [];

  for (const meta of dashReports) {
    try {
      const result = await runReport(meta.id, rangeKey, custom);
      results.push(result);
    } catch (err: any) {
      console.error(`Report ${meta.id} failed:`, err?.message ?? err);
      results.push({
        reportId: meta.id,
        title: meta.title,
        chartType: meta.chartType,
        dateRange: { from: "", to: "", label: "" },
        data: { kpiValue: "Error", kpiDelta: err?.message ?? "Failed to load" },
        generatedAt: new Date().toISOString(),
      });
    }
  }

  return results;
}

// ── Cached data access (for chat agent) ─────────────────────────────

/** Return all cached report results, grouped by date range.
 *  The chat agent calls this to answer questions using pre-loaded data. */
export function getCachedReportData(
  dashboardId?: DashboardId,
  rangeKey?: string,
): Record<string, ReportResult> {
  const allEntries = getAllCached<ReportResult>("report:");
  const result: Record<string, ReportResult> = {};

  for (const { key, data } of allEntries) {
    // key format: "report:<reportId>:<rangeKey>"
    const parts = key.split(":");
    const entryReportId = parts[1];
    const entryRange = parts[2];

    // Filter by dashboard if specified
    if (dashboardId) {
      const meta = reportMap.get(entryReportId);
      if (!meta || meta.dashboard !== dashboardId) continue;
    }
    // Filter by range if specified
    if (rangeKey && entryRange !== rangeKey) continue;

    result[key] = data;
  }
  return result;
}

/** Return cache diagnostics */
export function getReportCacheStats() {
  return cacheStats();
}

// ── Warm-up: pre-load all reports across all date ranges ─────────────

const DEFAULT_WARM_RANGES: DateRangeKey[] = ["last_30", "mtd", "ltm"];
const ALL_DASHBOARDS: DashboardId[] = ["executive", "operations", "prescriptions"];

function getWarmRanges(): DateRangeKey[] {
  const raw = process.env.REPORT_WARM_RANGES?.trim();
  if (!raw) return DEFAULT_WARM_RANGES;

  const requested = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean) as DateRangeKey[];

  return requested.length > 0 ? requested : DEFAULT_WARM_RANGES;
}

/** Pre-load every report for every date range. Runs sequentially to
 *  respect the rate limiter. Returns total reports warmed. */
export async function warmAllReports(): Promise<number> {
  let count = 0;
  const startTime = Date.now();
  const warmRanges = getWarmRanges();
  console.log(`[WARM] Starting report warm-up across ${warmRanges.length} date ranges...`);

  for (const range of warmRanges) {
    for (const dash of ALL_DASHBOARDS) {
      const dashReports = getReportsForDashboard(dash);
      for (const meta of dashReports) {
        try {
          await runReport(meta.id, range);
          count++;
        } catch (err: any) {
          console.error(`[WARM] ${meta.id}/${range} failed:`, err?.message ?? err);
        }
      }
    }
    console.log(`[WARM] Range "${range}" complete (${count} reports so far)`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[WARM] Complete: ${count} reports warmed in ${elapsed}s`);
  return count;
}
