/**
 * Executive Dashboard — 8 reports
 * Revenue from Shopify orders, patient metrics from deals, top products.
 */

import { searchObjects } from "../hubspot/client.js";
import { PIPELINE_ID, STAGES } from "../hubspot/types.js";
import type { SearchFilter } from "../hubspot/types.js";
import { toHsTimestamp, type DateRange } from "./date-ranges.js";
import {
  aggregateCount,
  aggregateSum,
  monthlyBreakdown,
  groupByProperty,
  groupByPropertyWithSum,
} from "./aggregation.js";
import { ORDERS_OBJECT_TYPE, AU_STATE_LABELS } from "./constants.js";
import type { ChartType } from "./constants.js";
import type { ReportResult } from "./index.js";

// ── Application stage (new patient applications) ────────────────────

const APPLICATION_STAGE_ID = "3271648990";

// ── Order date filters (Shopify orders) ─────────────────────────────

function orderDateFilters(range: DateRange): SearchFilter[] {
  return [
    { propertyName: "hs_external_created_date", operator: "GTE", value: toHsTimestamp(range.from) },
    { propertyName: "hs_external_created_date", operator: "LTE", value: toHsTimestamp(range.to) },
  ];
}

// ── 1. Total Revenue (from Shopify orders) ──────────────────────────

export async function execTotalRevenue(range: DateRange): Promise<ReportResult> {
  const { sum, count } = await aggregateSum(
    ORDERS_OBJECT_TYPE,
    [{ filters: orderDateFilters(range) }],
    "hs_total_price",
  );

  return {
    reportId: "exec_total_revenue",
    title: "Total Revenue",
    chartType: "kpi",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      kpiValue: `$${sum.toLocaleString("en-AU", { minimumFractionDigits: 0 })}`,
      kpiDelta: `${count} Shopify orders`,
    },
  };
}

// ── 2. Revenue by Month (from Shopify orders) ───────────────────────

export async function execRevenueByMonth(range: DateRange): Promise<ReportResult> {
  const data = await monthlyBreakdown(
    ORDERS_OBJECT_TYPE,
    [],
    "hs_external_created_date",
    range,
    { valueProperty: "hs_total_price" },
  );

  return {
    reportId: "exec_revenue_by_month",
    title: "Revenue by Month",
    chartType: "bar",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      labels: data.map((d) => d.month),
      values: data.map((d) => d.sum ?? 0),
    },
  };
}

// ── 3. Average Order Value (from Shopify orders) ────────────────────

export async function execAvgOrderValue(range: DateRange): Promise<ReportResult> {
  const { sum, count } = await aggregateSum(
    ORDERS_OBJECT_TYPE,
    [{ filters: orderDateFilters(range) }],
    "hs_total_price",
  );

  const avg = count > 0 ? sum / count : 0;

  return {
    reportId: "exec_avg_order_value",
    title: "Average Order Value",
    chartType: "kpi",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      kpiValue: `$${avg.toFixed(0)}`,
      kpiDelta: `Based on ${count} Shopify orders`,
    },
  };
}

// ── 4. New Patients (deals entering Application stage) ──────────────

export async function execNewPatients(range: DateRange): Promise<ReportResult> {
  // New patients = new deals created in the sales pipeline during the period
  // Each deal represents a treatment application from a patient
  const data = await monthlyBreakdown(
    "deals",
    [
      { propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID },
    ],
    "createdate",
    range,
  );

  const totalNew = data.reduce((s, d) => s + d.count, 0);

  return {
    reportId: "exec_new_patients",
    title: "New Patient Applications",
    chartType: "bar",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      labels: data.map((d) => d.month),
      values: data.map((d) => d.count),
      kpiValue: totalNew,
      kpiDelta: `New deal applications`,
    },
  };
}

// ── 5. Returning Patients (contacts with 2+ Shopify orders) ─────────

export async function execReturningPatients(range: DateRange): Promise<ReportResult> {
  // Approximate returning patients by grouping orders by billing name
  // Contacts appearing more than once = returning patients
  const groups = await groupByProperty(
    ORDERS_OBJECT_TYPE,
    [{
      filters: orderDateFilters(range),
    }],
    "hs_billing_address_name",
    undefined,
    50, // Paginate deeply for accuracy
  );

  const uniqueCustomers = groups.length;
  const returningCustomers = groups.filter((g) => g.count > 1).length;
  const totalOrders = groups.reduce((s, g) => s + g.count, 0);

  return {
    reportId: "exec_returning_patients",
    title: "Returning Patients",
    chartType: "kpi",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      kpiValue: returningCustomers,
      kpiDelta: `${returningCustomers} returning of ${uniqueCustomers} unique customers (${totalOrders} orders)`,
    },
  };
}

// ── 6. New Treatments vs Renewals ───────────────────────────────────

export async function execNewVsRenewals(range: DateRange): Promise<ReportResult> {
  // Group orders by billing name to identify first-time vs repeat purchasers
  const groups = await groupByProperty(
    ORDERS_OBJECT_TYPE,
    [{
      filters: orderDateFilters(range),
    }],
    "hs_billing_address_name",
    undefined,
    50,
  );

  const newCustomers = groups.filter((g) => g.count === 1).length;
  const repeatCustomers = groups.filter((g) => g.count > 1).length;
  // Total repeat orders (sum of orders from customers with >1 order, minus their first)
  const repeatOrders = groups
    .filter((g) => g.count > 1)
    .reduce((s, g) => s + (g.count - 1), 0);

  return {
    reportId: "exec_new_vs_renewals",
    title: "New vs Repeat Customers",
    chartType: "doughnut",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      labels: ["First-time Customers", "Repeat Customers"],
      values: [newCustomers, repeatCustomers],
    },
  };
}

// ── 7. Conversion Funnel ────────────────────────────────────────────

export async function execConversionFunnel(range: DateRange): Promise<ReportResult> {
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
    reportId: "exec_conversion_funnel",
    title: "Pipeline Funnel",
    chartType: "funnel",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      labels: counts.map((c) => c.label),
      values: counts.map((c) => c.count),
    },
  };
}

// ── Treatment type classifier (parse from deal name) ────────────────

function classifyTreatment(dealname: string): string {
  const upper = (dealname ?? "").toUpperCase();
  if (upper.includes("HORMONE RESET")) return "TRT / Hormone Reset";
  if (upper.includes("WEIGHT LOSS") || upper.includes("PERFORMANCE") || upper.includes("INJURY REPAIR"))
    return "Weight Loss / Perf / Injury";
  return "Other";
}

// ── 8. Top Products (table view from line items) ────────────────────

export async function execTopProducts(range: DateRange): Promise<ReportResult> {
  // Get line items created in the period, group by name
  const groups = await groupByProperty(
    "line_items",
    [{
      filters: [
        { propertyName: "createdate", operator: "GTE", value: toHsTimestamp(range.from) },
        { propertyName: "createdate", operator: "LTE", value: toHsTimestamp(range.to) },
      ],
    }],
    "name",
    undefined,
    15,
  );

  const top10 = groups.slice(0, 10);

  return {
    reportId: "exec_top_products",
    title: "Top Products",
    chartType: "table",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      rows: top10.map((g, idx) => ({
        "#": idx + 1,
        "Product": g.label,
        "Count": g.count,
      })),
    },
  };
}

// ── 9. Revenue by State ─────────────────────────────────────────────

export async function execRevenueByState(range: DateRange): Promise<ReportResult> {
  const groups = await groupByPropertyWithSum(
    ORDERS_OBJECT_TYPE,
    [{ filters: orderDateFilters(range) }],
    "hs_billing_address_state",
    "hs_total_price",
    AU_STATE_LABELS,
    50, // Max 10K results (HubSpot pagination cap)
  );

  const top = groups.filter((g) => g.value !== "(empty)").slice(0, 10);

  return {
    reportId: "exec_revenue_by_state",
    title: "Revenue by State",
    chartType: "bar",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      labels: top.map((g) => g.label),
      values: top.map((g) => Math.round(g.sum)),
    },
  };
}

// ── 10. Treatment Type Breakdown ────────────────────────────────────

export async function execTreatmentTypes(range: DateRange): Promise<ReportResult> {
  const counts = new Map<string, number>();
  let after: string | undefined;

  for (let page = 0; page < 30; page++) {
    const res = await searchObjects("deals", {
      filterGroups: [{
        filters: [
          { propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID },
          { propertyName: "createdate", operator: "GTE", value: toHsTimestamp(range.from) },
          { propertyName: "createdate", operator: "LTE", value: toHsTimestamp(range.to) },
        ],
      }],
      properties: ["dealname"],
      limit: 200,
      ...(after ? { after } : {}),
    });

    for (const deal of res.results) {
      const type = classifyTreatment(deal.properties.dealname ?? "");
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }

    if (!res.paging?.next?.after) break;
    after = res.paging.next.after;
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

  return {
    reportId: "exec_treatment_types",
    title: "Treatment Types",
    chartType: "doughnut",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      labels: sorted.map(([label]) => label),
      values: sorted.map(([, count]) => count),
    },
  };
}

// ── 11. Conversion Rate ─────────────────────────────────────────────

export async function execConversionRate(range: DateRange): Promise<ReportResult> {
  const dateFilters: SearchFilter[] = [
    { propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID },
    { propertyName: "createdate", operator: "GTE", value: toHsTimestamp(range.from) },
    { propertyName: "createdate", operator: "LTE", value: toHsTimestamp(range.to) },
  ];

  const [total, approved] = await Promise.all([
    aggregateCount("deals", [{ filters: dateFilters }]),
    aggregateCount("deals", [{
      filters: [...dateFilters, { propertyName: "dealstage", operator: "EQ", value: "3271648998" }],
    }]),
  ]);

  const rate = total > 0 ? ((approved / total) * 100).toFixed(1) : "0";

  return {
    reportId: "exec_conversion_rate",
    title: "Conversion Rate",
    chartType: "kpi",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      kpiValue: `${rate}%`,
      kpiDelta: `${approved.toLocaleString()} approved of ${total.toLocaleString()} applications`,
    },
  };
}

// ── 12. Gender Distribution ──────────────────────────────────────────

export async function execGenderDistribution(_range: DateRange): Promise<ReportResult> {
  const groups = await groupByProperty(
    "contacts",
    [{ filters: [] }],
    "gender",
    {
      MALE: "Male", FEMALE: "Female",
      male: "Male", female: "Female",
      Male: "Male", Female: "Female",
    },
    15,
  );

  // Filter out empty values
  const filtered = groups.filter((g) => g.value !== "(empty)" && g.label !== "(empty)");

  return {
    reportId: "exec_gender_distribution",
    title: "Gender Distribution",
    chartType: "doughnut",
    dateRange: { from: _range.from.toISOString(), to: _range.to.toISOString(), label: _range.label },
    data: {
      labels: filtered.map((g) => g.label),
      values: filtered.map((g) => g.count),
    },
  };
}

// ── 13. Patient Age Distribution ────────────────────────────────────

export async function execAgeBrackets(_range: DateRange): Promise<ReportResult> {
  const buckets: Record<string, number> = {
    "18-25": 0, "26-35": 0, "36-45": 0, "46-55": 0, "56-65": 0, "65+": 0,
  };
  let after: string | undefined;
  const now = new Date();

  for (let page = 0; page < 30; page++) {
    const res = await searchObjects("contacts", {
      filterGroups: [{
        filters: [
          { propertyName: "date_of_birth", operator: "HAS_PROPERTY" },
        ],
      }],
      properties: ["date_of_birth"],
      limit: 200,
      ...(after ? { after } : {}),
    });

    for (const c of res.results) {
      const dobStr = c.properties.date_of_birth;
      if (!dobStr) continue;
      const dob = new Date(dobStr);
      if (isNaN(dob.getTime())) continue;
      const age = Math.floor((now.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      if (age < 18) continue;
      if (age <= 25) buckets["18-25"]++;
      else if (age <= 35) buckets["26-35"]++;
      else if (age <= 45) buckets["36-45"]++;
      else if (age <= 55) buckets["46-55"]++;
      else if (age <= 65) buckets["56-65"]++;
      else buckets["65+"]++;
    }

    if (!res.paging?.next?.after) break;
    after = res.paging.next.after;
  }

  return {
    reportId: "exec_age_brackets",
    title: "Patient Age Distribution",
    chartType: "bar",
    dateRange: { from: _range.from.toISOString(), to: _range.to.toISOString(), label: _range.label },
    data: {
      labels: Object.keys(buckets),
      values: Object.values(buckets),
    },
  };
}

// ── 14. Patient Lifetime Value ──────────────────────────────────────

export async function execPatientLTV(range: DateRange): Promise<ReportResult> {
  // Group orders by billing name within date range, sum hs_total_price per customer.
  // Uses date-filtered query to stay under HubSpot's 10K pagination cap.
  const groups = await groupByPropertyWithSum(
    ORDERS_OBJECT_TYPE,
    [{ filters: orderDateFilters(range) }],
    "hs_billing_address_name",
    "hs_total_price",
    undefined,
    50, // Max 10K results (50 * 200)
  );

  // Filter out empty names
  const customers = groups.filter((g) => g.value !== "(empty)" && g.value.trim() !== "");
  const totalCustomers = customers.length;
  const totalRevenue = customers.reduce((s, g) => s + g.sum, 0);
  const avgLTV = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

  return {
    reportId: "exec_patient_ltv",
    title: "Avg Patient Lifetime Value",
    chartType: "kpi",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      kpiValue: `$${avgLTV.toFixed(0)}`,
      kpiDelta: `Average across ${totalCustomers.toLocaleString()} customers`,
    },
  };
}

