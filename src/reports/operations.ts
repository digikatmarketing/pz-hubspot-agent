/**
 * Operations Dashboard — 9 reports
 * Orders, pipeline health, deals by owner, stale deals, tickets.
 */

import { searchObjects } from "../hubspot/client.js";
import { PIPELINE_ID, STAGES } from "../hubspot/types.js";
import type { SearchFilter } from "../hubspot/types.js";
import { toHsTimestamp, type DateRange } from "./date-ranges.js";
import {
  aggregateCount,
  monthlyBreakdown,
  groupByProperty,
} from "./aggregation.js";
import { ORDER_PIPELINE_ID, ORDER_STAGES, ORDERS_OBJECT_TYPE } from "./constants.js";
import type { ReportResult } from "./index.js";

// ── 1. Orders by Status (Shopify orders object) ────────────────────

export async function opsOrdersByStatus(_range: DateRange): Promise<ReportResult> {
  const stageEntries = Object.values(ORDER_STAGES).sort((a, b) => a.order - b.order);

  const counts = await Promise.all(
    stageEntries.map(async (stage) => {
      const count = await aggregateCount(ORDERS_OBJECT_TYPE, [{
        filters: [
          { propertyName: "hs_pipeline", operator: "EQ", value: ORDER_PIPELINE_ID },
          { propertyName: "hs_pipeline_stage", operator: "EQ", value: stage.id },
        ],
      }]);
      return { label: stage.label, count };
    }),
  );

  return {
    reportId: "ops_orders_by_status",
    title: "Shopify Orders by Status",
    chartType: "doughnut",
    dateRange: { from: _range.from.toISOString(), to: _range.to.toISOString(), label: _range.label },
    data: {
      labels: counts.map((c) => c.label),
      values: counts.map((c) => c.count),
    },
  };
}

// ── 2. Orders Over Time (Shopify orders object) ────────────────────

export async function opsOrdersOverTime(range: DateRange): Promise<ReportResult> {
  const data = await monthlyBreakdown(
    ORDERS_OBJECT_TYPE,
    [],
    "hs_external_created_date",
    range,
  );

  return {
    reportId: "ops_orders_over_time",
    title: "Shopify Orders Over Time",
    chartType: "line",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      labels: data.map((d) => d.month),
      values: data.map((d) => d.count),
    },
  };
}

// ── 3. Pipeline Stage Distribution ──────────────────────────────────

export async function opsPipelineDistribution(_range: DateRange): Promise<ReportResult> {
  const stageEntries = Object.values(STAGES).sort((a, b) => a.order - b.order);

  const counts = await Promise.all(
    stageEntries.map(async (stage) => {
      const count = await aggregateCount("deals", [{
        filters: [
          { propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID },
          { propertyName: "dealstage", operator: "EQ", value: stage.id },
        ],
      }]);
      return { label: stage.label, count };
    }),
  );

  return {
    reportId: "ops_pipeline_distribution",
    title: "Sales Pipeline Distribution",
    chartType: "bar",
    dateRange: { from: _range.from.toISOString(), to: _range.to.toISOString(), label: _range.label },
    data: {
      labels: counts.map((c) => c.label),
      values: counts.map((c) => c.count),
    },
  };
}

// ── 4. Deals by Owner ───────────────────────────────────────────────

export async function opsDealsByOwner(range: DateRange): Promise<ReportResult> {
  const groups = await groupByProperty(
    "deals",
    [{
      filters: [
        { propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID },
        { propertyName: "createdate", operator: "GTE", value: toHsTimestamp(range.from) },
        { propertyName: "createdate", operator: "LTE", value: toHsTimestamp(range.to) },
      ],
    }],
    "hubspot_owner_id",
    undefined,
    15,
  );

  return {
    reportId: "ops_deals_by_owner",
    title: "Deals by Owner",
    chartType: "bar",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      labels: groups.map((g) => g.label === "(empty)" ? "Unassigned" : `Owner ${g.label}`),
      values: groups.map((g) => g.count),
    },
  };
}

// ── 5. Stale Deals (30+ days in stage) ──────────────────────────────

export async function opsStaleDealsSummary(_range: DateRange): Promise<ReportResult> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = toHsTimestamp(cutoff);

  // Count stale deals per active stage (exclude Approved/Cancelled)
  const activeStages = Object.values(STAGES).filter(
    (s) => s.label !== "Approved by Doctor" && s.label !== "Cancelled",
  );

  const counts = await Promise.all(
    activeStages.map(async (stage) => {
      const enteredProperty = `hs_v2_date_entered_${stage.id}`;
      const count = await aggregateCount("deals", [{
        filters: [
          { propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID },
          { propertyName: "dealstage", operator: "EQ", value: stage.id },
          { propertyName: enteredProperty, operator: "LT", value: cutoffStr },
        ],
      }]);
      return { label: stage.label, count };
    }),
  );

  const totalStale = counts.reduce((s, c) => s + c.count, 0);

  return {
    reportId: "ops_stale_deals",
    title: "Stale Deals (30+ days)",
    chartType: "bar",
    dateRange: { from: _range.from.toISOString(), to: _range.to.toISOString(), label: _range.label },
    data: {
      labels: counts.map((c) => c.label),
      values: counts.map((c) => c.count),
      kpiValue: totalStale,
      kpiDelta: "Total stale deals across stages",
    },
  };
}

// ── 6. Average Time in Stage ────────────────────────────────────────

export async function opsAvgTimeInStage(_range: DateRange): Promise<ReportResult> {
  // Use hs_v2_date_entered/exited properties for each stage
  // This is an approximation — we sample recent approved deals
  const res = await searchObjects("deals", {
    filterGroups: [{
      filters: [
        { propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID },
        { propertyName: "dealstage", operator: "EQ", value: "3271648998" }, // Approved
      ],
    }],
    properties: [
      "hs_v2_date_entered_3271916229", "hs_v2_date_exited_3271916229",     // Lead
      "hs_v2_date_entered_3271938765", "hs_v2_date_exited_3271938765",     // Meeting Booked
      "hs_v2_date_entered_3271648990", "hs_v2_date_exited_3271648990",     // Application
      "hs_v2_date_entered_3271648991", "hs_v2_date_exited_3271648991",     // Submission Check
      "hs_v2_date_entered_3271648993", "hs_v2_date_exited_3271648993",     // Doctor Review
      "hs_v2_date_entered_3271648998",                                      // Approved (entered)
    ],
    limit: 100,
    sorts: [{ propertyName: "closedate", direction: "DESCENDING" }],
  });

  // Calculate average days between entered and exited for each stage
  const stageTimings: Record<string, { total: number; count: number }> = {};
  const stageIds = [
    { id: "3271916229", label: "Lead" },
    { id: "3271938765", label: "Meeting Booked" },
    { id: "3271648990", label: "Application" },
    { id: "3271648991", label: "Submission Check" },
    { id: "3271648993", label: "Doctor Review" },
  ];

  for (const deal of res.results) {
    for (const stage of stageIds) {
      const entered = deal.properties[`hs_v2_date_entered_${stage.id}`];
      const exited = deal.properties[`hs_v2_date_exited_${stage.id}`];
      if (entered && exited) {
        const days = (new Date(exited).getTime() - new Date(entered).getTime()) / (1000 * 60 * 60 * 24);
        if (days >= 0 && days < 365) {
          if (!stageTimings[stage.label]) stageTimings[stage.label] = { total: 0, count: 0 };
          stageTimings[stage.label].total += days;
          stageTimings[stage.label].count++;
        }
      }
    }
  }

  const labels: string[] = [];
  const values: number[] = [];
  for (const stage of stageIds) {
    const timing = stageTimings[stage.label];
    labels.push(stage.label);
    values.push(timing ? Math.round(timing.total / timing.count) : 0);
  }

  return {
    reportId: "ops_avg_time_in_stage",
    title: "Avg Days in Stage",
    chartType: "bar",
    dateRange: { from: _range.from.toISOString(), to: _range.to.toISOString(), label: _range.label },
    data: { labels, values },
  };
}

// ── 7. Lead Source Breakdown ────────────────────────────────────────

export async function opsLeadSourceBreakdown(range: DateRange): Promise<ReportResult> {
  const groups = await groupByProperty(
    "contacts",
    [{
      filters: [
        { propertyName: "createdate", operator: "GTE", value: toHsTimestamp(range.from) },
        { propertyName: "createdate", operator: "LTE", value: toHsTimestamp(range.to) },
      ],
    }],
    "hs_analytics_source",
    {
      ORGANIC_SEARCH: "Organic Search",
      PAID_SEARCH: "Paid Search",
      PAID_SOCIAL: "Paid Social",
      SOCIAL_MEDIA: "Social Media",
      REFERRALS: "Referrals",
      DIRECT_TRAFFIC: "Direct Traffic",
      EMAIL_MARKETING: "Email Marketing",
      OTHER_CAMPAIGNS: "Other Campaigns",
      OFFLINE: "Offline",
    },
    10,
  );

  return {
    reportId: "ops_lead_source",
    title: "Lead Sources",
    chartType: "doughnut",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      labels: groups.map((g) => g.label),
      values: groups.map((g) => g.count),
    },
  };
}

// ── 8. Tickets by Status ────────────────────────────────────────────

export async function opsTicketsByStatus(_range: DateRange): Promise<ReportResult> {
  const groups = await groupByProperty(
    "tickets",
    [{ filters: [] }],
    "hs_pipeline_stage",
    undefined,
    10,
  );

  return {
    reportId: "ops_tickets_by_status",
    title: "Tickets by Status",
    chartType: "doughnut",
    dateRange: { from: _range.from.toISOString(), to: _range.to.toISOString(), label: _range.label },
    data: {
      labels: groups.map((g) => g.label),
      values: groups.map((g) => g.count),
    },
  };
}

// ── 9. Tickets Over Time ────────────────────────────────────────────

export async function opsTicketsOverTime(range: DateRange): Promise<ReportResult> {
  const data = await monthlyBreakdown(
    "tickets",
    [],
    "createdate",
    range,
  );

  return {
    reportId: "ops_tickets_over_time",
    title: "Tickets Over Time",
    chartType: "line",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      labels: data.map((d) => d.month),
      values: data.map((d) => d.count),
    },
  };
}

// ── 10. Avg Fulfillment Time ────────────────────────────────────────

export async function opsFulfillmentTime(range: DateRange): Promise<ReportResult> {
  // Sample delivered orders and compute avg days from order creation to last modification
  const res = await searchObjects(ORDERS_OBJECT_TYPE, {
    filterGroups: [{
      filters: [
        { propertyName: "hs_pipeline_stage", operator: "EQ", value: "3725360f-519b-4b18-a593-494d60a29c9f" }, // Delivered
        { propertyName: "hs_external_created_date", operator: "GTE", value: toHsTimestamp(range.from) },
        { propertyName: "hs_external_created_date", operator: "LTE", value: toHsTimestamp(range.to) },
      ],
    }],
    properties: ["hs_external_created_date", "hs_lastmodifieddate"],
    limit: 200,
    sorts: [{ propertyName: "hs_external_created_date", direction: "DESCENDING" }],
  });

  let totalDays = 0;
  let count = 0;
  for (const order of res.results) {
    const created = new Date(order.properties.hs_external_created_date ?? "");
    const modified = new Date(order.properties.hs_lastmodifieddate ?? "");
    if (isNaN(created.getTime()) || isNaN(modified.getTime())) continue;
    const days = (modified.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    if (days >= 0 && days < 180) {
      totalDays += days;
      count++;
    }
  }

  const avg = count > 0 ? (totalDays / count).toFixed(1) : "N/A";

  return {
    reportId: "ops_fulfillment_time",
    title: "Avg Fulfillment Time",
    chartType: "kpi",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      kpiValue: `${avg} days`,
      kpiDelta: `Based on ${count} delivered orders`,
    },
  };
}

// ── 11. Tickets by Priority ─────────────────────────────────────────

export async function opsTicketsByPriority(range: DateRange): Promise<ReportResult> {
  const groups = await groupByProperty(
    "tickets",
    [{ filters: [] }],
    "hs_ticket_priority",
    { HIGH: "High", MEDIUM: "Medium", LOW: "Low" },
    10,
  );

  const filtered = groups.filter((g) => g.value !== "(empty)");

  return {
    reportId: "ops_tickets_by_priority",
    title: "Tickets by Priority",
    chartType: "bar",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      labels: filtered.map((g) => g.label),
      values: filtered.map((g) => g.count),
    },
  };
}

// ── 12. Tickets by Category ─────────────────────────────────────────

export async function opsTicketsByCategory(range: DateRange): Promise<ReportResult> {
  const groups = await groupByProperty(
    "tickets",
    [{ filters: [] }],
    "hs_ticket_category",
    undefined,
    10,
  );

  const filtered = groups.filter((g) => g.value !== "(empty)");

  return {
    reportId: "ops_tickets_by_category",
    title: "Tickets by Category",
    chartType: "doughnut",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      labels: filtered.map((g) => g.label),
      values: filtered.map((g) => g.count),
    },
  };
}

// ── 13. Cancellation Rate ───────────────────────────────────────────

export async function opsCancellationRate(range: DateRange): Promise<ReportResult> {
  const dateFilters: SearchFilter[] = [
    { propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID },
    { propertyName: "createdate", operator: "GTE", value: toHsTimestamp(range.from) },
    { propertyName: "createdate", operator: "LTE", value: toHsTimestamp(range.to) },
  ];

  const [total, cancelled] = await Promise.all([
    aggregateCount("deals", [{ filters: dateFilters }]),
    aggregateCount("deals", [{
      filters: [...dateFilters, { propertyName: "dealstage", operator: "EQ", value: "3271648995" }],
    }]),
  ]);

  const rate = total > 0 ? ((cancelled / total) * 100).toFixed(1) : "0";

  return {
    reportId: "ops_cancellation_rate",
    title: "Cancellation Rate",
    chartType: "kpi",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      kpiValue: `${rate}%`,
      kpiDelta: `${cancelled.toLocaleString()} cancelled of ${total.toLocaleString()} applications`,
    },
  };
}

// ── 14. Cancellation Trend ──────────────────────────────────────────

export async function opsCancellationTrend(range: DateRange): Promise<ReportResult> {
  const data = await monthlyBreakdown(
    "deals",
    [
      { propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID },
      { propertyName: "dealstage", operator: "EQ", value: "3271648995" }, // Cancelled
    ],
    "createdate",
    range,
  );

  return {
    reportId: "ops_cancellation_trend",
    title: "Cancellation Trend",
    chartType: "line",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      labels: data.map((d) => d.month),
      values: data.map((d) => d.count),
    },
  };
}
