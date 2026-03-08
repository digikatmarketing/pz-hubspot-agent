/**
 * Report tools — let the agent run reports via natural language.
 * Includes tools for running live reports AND reading cached data.
 */

import {
  listReports,
  runReport,
  runDashboard,
  getCachedReportData,
  getReportCacheStats,
} from "../reports/index.js";
import { getSummaryKPIs } from "../reports/summary.js";
import { getRecommendations } from "../recommendations.js";
import type { ToolDef } from "./index.js";
import type { DashboardId } from "../reports/constants.js";
import type { DateRangeKey } from "../reports/date-ranges.js";

export const reportTools: ToolDef[] = [
  {
    name: "list_reports",
    description:
      "List all available reports grouped by dashboard (Executive, Operations, Prescriptions). Returns report IDs, titles, and chart types. Use this to discover which reports are available before running them.",
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
    execute: async () => {
      return listReports();
    },
  },

  {
    name: "run_report",
    description:
      'Run a specific report by its ID. Returns chart data, KPI values, or table rows depending on the report type. Reports are cached for 12 hours so repeated calls are instant. Available date ranges: "mtd" (Month to Date), "ytd" (Year to Date), "ltm" (Last 12 Months), "last_30" (Last 30 Days), "last_90" (Last 90 Days), "custom" (requires from/to dates). Example report IDs: exec_total_revenue, exec_new_patients, ops_pipeline_distribution, rx_by_status.',
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {
        report_id: {
          type: "string",
          description: "The report ID to run (e.g. 'exec_total_revenue', 'ops_stale_deals', 'rx_by_status')",
        },
        date_range: {
          type: "string",
          description: 'Date range key: "mtd", "ytd", "ltm", "last_30", "last_90", or "custom". Defaults to the report\'s default range (usually ltm).',
        },
        from: {
          type: "string",
          description: "Start date for custom range (YYYY-MM-DD). Only needed when date_range is 'custom'.",
        },
        to: {
          type: "string",
          description: "End date for custom range (YYYY-MM-DD). Only needed when date_range is 'custom'.",
        },
      },
      required: ["report_id"],
    },
    execute: async (input: Record<string, unknown>) => {
      const { report_id, date_range, from, to } = input as {
        report_id: string;
        date_range?: string;
        from?: string;
        to?: string;
      };

      try {
        const result = await runReport(
          report_id,
          date_range as DateRangeKey | undefined,
          from && to ? { from, to } : undefined,
        );
        return result;
      } catch (err: any) {
        return { error: err.message };
      }
    },
  },

  {
    name: "dashboard_summary",
    description:
      'Run all reports for a dashboard and return a combined summary. Dashboard IDs: "executive", "operations", "prescriptions". Useful when the user wants an overview of a whole dashboard.',
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {
        dashboard: {
          type: "string",
          description: 'Dashboard ID: "executive", "operations", or "prescriptions"',
        },
        date_range: {
          type: "string",
          description: 'Date range: "mtd", "ytd", "ltm", "last_30", "last_90". Defaults to "ltm".',
        },
      },
      required: ["dashboard"],
    },
    execute: async (input: Record<string, unknown>) => {
      const { dashboard, date_range } = input as {
        dashboard: string;
        date_range?: string;
      };

      const validDashboards = ["executive", "operations", "prescriptions"];
      if (!validDashboards.includes(dashboard)) {
        return { error: `Invalid dashboard. Must be one of: ${validDashboards.join(", ")}` };
      }

      try {
        const results = await runDashboard(
          dashboard as DashboardId,
          (date_range as DateRangeKey) ?? "ltm",
        );
        return {
          dashboard,
          reportCount: results.length,
          reports: results,
        };
      } catch (err: any) {
        return { error: err.message };
      }
    },
  },

  {
    name: "get_cached_reports",
    description:
      'Instantly read all pre-loaded report data from the 12-hour cache. Reports are warmed on server startup across all date ranges (last_30, mtd, last_90, ltm, ytd) and refreshed every 12 hours. Use this FIRST when answering questions about metrics, KPIs, revenue, patients, or operations — it returns data instantly without any API calls. Optionally filter by dashboard and/or date range. Returns all cached report results with their data.',
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {
        dashboard: {
          type: "string",
          description: 'Optional filter: "executive", "operations", or "prescriptions". Omit to get all dashboards.',
        },
        date_range: {
          type: "string",
          description: 'Optional filter: "last_30", "mtd", "last_90", "ltm", "ytd". Omit to get all ranges.',
        },
      },
      required: [],
    },
    execute: async (input: Record<string, unknown>) => {
      const { dashboard, date_range } = input as {
        dashboard?: string;
        date_range?: string;
      };

      const data = getCachedReportData(
        dashboard as DashboardId | undefined,
        date_range,
      );

      const stats = getReportCacheStats();
      const reportCount = Object.keys(data).length;

      if (reportCount === 0) {
        return {
          message: "No cached data available yet. Reports may still be warming up. Use run_report or dashboard_summary to fetch live data.",
          cacheSize: stats.count,
        };
      }

      return {
        reportCount,
        cacheSize: stats.count,
        reports: data,
      };
    },
  },

  {
    name: "summary_kpis",
    description:
      "Get the 4 top-level summary KPIs: Total Revenue, Total Patients, Total Orders, Active Rx. These are all-time totals (not date-filtered). Cached for 12 hours.",
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
    execute: async () => {
      try {
        return await getSummaryKPIs();
      } catch (err: any) {
        return { error: err.message };
      }
    },
  },

  {
    name: "get_recommendations",
    description:
      "Get AI-generated business recommendations based on cached report data. Returns 5-8 prioritised actions covering revenue growth, patient retention, operations, marketing, and prescription management. Use this when users ask about priorities, what to focus on, improvement opportunities, what needs attention, or business strategy. Recommendations are regenerated every 12 hours alongside report data.",
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
    execute: async () => {
      const result = getRecommendations();
      if (!result) {
        return {
          message:
            "Recommendations are still being generated. They'll be available shortly after the report cache finishes warming up. Try again in a minute.",
        };
      }
      return result;
    },
  },
];
