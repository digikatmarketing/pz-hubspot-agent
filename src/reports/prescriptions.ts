/**
 * Prescriptions Dashboard — 7 reports
 * Rx status distribution, trends, top medications, dispensing rate.
 */

import { PRESCRIPTIONS_OBJECT_TYPE } from "../hubspot/types.js";
import { batchReadAssociations, searchObjects } from "../hubspot/client.js";
import type { SearchFilter } from "../hubspot/types.js";
import { toHsTimestamp, type DateRange } from "./date-ranges.js";
import {
  aggregateCount,
  monthlyBreakdown,
  groupByProperty,
} from "./aggregation.js";
import { getCached, setCache } from "./cache.js";
import { RX_STATUS_LABELS } from "./constants.js";
import type { ReportResult } from "./index.js";

const RX_PATIENT_COUNT_CACHE_KEY = "rx_unique_patients_v1";

function prescriptionHalfYearFilters(): Array<{
  filters: Array<{ propertyName: string; operator: string; value: string }>;
}> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const startYear = 2023;
  const chunks: Array<{
    filters: Array<{ propertyName: string; operator: string; value: string }>;
  }> = [];

  for (let year = startYear; year <= currentYear; year++) {
    chunks.push({
      filters: [
        { propertyName: "hs_createdate", operator: "GTE", value: toHsTimestamp(new Date(year, 0, 1)) },
        { propertyName: "hs_createdate", operator: "LT", value: toHsTimestamp(new Date(year, 6, 1)) },
      ],
    });

    if (year < currentYear || now.getMonth() >= 6) {
      chunks.push({
        filters: [
          { propertyName: "hs_createdate", operator: "GTE", value: toHsTimestamp(new Date(year, 6, 1)) },
          { propertyName: "hs_createdate", operator: "LT", value: toHsTimestamp(new Date(year + 1, 0, 1)) },
        ],
      });
    }
  }

  return chunks;
}

async function getUniquePrescriptionPatientCount(): Promise<number> {
  const cached = getCached<number>(RX_PATIENT_COUNT_CACHE_KEY);
  if (cached !== null) return cached;

  const contactIds = new Set<string>();
  const chunks = prescriptionHalfYearFilters();

  for (const chunk of chunks) {
    let after: string | undefined;

    for (let page = 0; page < 50; page++) {
      const res = await searchObjects(PRESCRIPTIONS_OBJECT_TYPE, {
        filterGroups: [{ filters: chunk.filters as SearchFilter[] }],
        properties: ["hs_object_id"],
        limit: 200,
        ...(after ? { after } : {}),
      });

      const prescriptionIds = res.results.map((rx) => rx.id);
      if (prescriptionIds.length > 0) {
        const assocRes = await batchReadAssociations(
          PRESCRIPTIONS_OBJECT_TYPE,
          "contacts",
          prescriptionIds,
        );

        for (const result of assocRes.results) {
          for (const associated of result.to) {
            contactIds.add(associated.toObjectId);
          }
        }
      }

      if (!res.paging?.next?.after) break;
      after = res.paging.next.after;
    }
  }

  const count = contactIds.size;
  setCache(RX_PATIENT_COUNT_CACHE_KEY, count);
  return count;
}

// ── 1. Rx by Status ────────────────────────────────────────────────

export async function rxByStatus(_range: DateRange): Promise<ReportResult> {
  const groups = await groupByProperty(
    PRESCRIPTIONS_OBJECT_TYPE,
    [{ filters: [] }],
    "prescription_status",
    RX_STATUS_LABELS,
    10,
  );

  return {
    reportId: "rx_by_status",
    title: "Prescriptions by Status",
    chartType: "doughnut",
    dateRange: { from: _range.from.toISOString(), to: _range.to.toISOString(), label: _range.label },
    data: {
      labels: groups.map((g) => g.label),
      values: groups.map((g) => g.count),
    },
  };
}

// ── 2. Rx Over Time ─────────────────────────────────────────────────

export async function rxOverTime(range: DateRange): Promise<ReportResult> {
  const data = await monthlyBreakdown(
    PRESCRIPTIONS_OBJECT_TYPE,
    [],
    "hs_createdate",
    range,
  );

  return {
    reportId: "rx_over_time",
    title: "Prescriptions Over Time",
    chartType: "line",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      labels: data.map((d) => d.month),
      values: data.map((d) => d.count),
    },
  };
}

// ── 3. Top Medications ──────────────────────────────────────────────

export async function rxTopMedications(range: DateRange): Promise<ReportResult> {
  const groups = await groupByProperty(
    PRESCRIPTIONS_OBJECT_TYPE,
    [{
      filters: [
        { propertyName: "hs_createdate", operator: "GTE", value: toHsTimestamp(range.from) },
        { propertyName: "hs_createdate", operator: "LTE", value: toHsTimestamp(range.to) },
      ],
    }],
    "medicine_name",
    undefined,
    20,
  );

  const top10 = groups.slice(0, 10);

  return {
    reportId: "rx_top_medications",
    title: "Top Medications",
    chartType: "table",
    dateRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    data: {
      rows: top10.map((g, idx) => ({
        "#": idx + 1,
        "Medication": g.label,
        "Prescriptions": g.count,
      })),
    },
  };
}

// ── 4. Active Rx Count ──────────────────────────────────────────────

export async function rxActiveCount(_range: DateRange): Promise<ReportResult> {
  const active = await aggregateCount(PRESCRIPTIONS_OBJECT_TYPE, [{
    filters: [
      { propertyName: "prescription_status", operator: "EQ", value: "ACTIVE" },
    ],
  }]);

  return {
    reportId: "rx_active_count",
    title: "Active Prescriptions",
    chartType: "kpi",
    dateRange: { from: _range.from.toISOString(), to: _range.to.toISOString(), label: _range.label },
    data: {
      kpiValue: active,
      kpiDelta: "Currently active",
    },
  };
}

// ── 5. Expiring Soon ────────────────────────────────────────────────

export async function rxExpiringSoon(_range: DateRange): Promise<ReportResult> {
  const count = await aggregateCount(PRESCRIPTIONS_OBJECT_TYPE, [{
    filters: [
      { propertyName: "prescription_status", operator: "EQ", value: "EXPIRING_SOON" },
    ],
  }]);

  return {
    reportId: "rx_expiring_soon",
    title: "Expiring Soon",
    chartType: "kpi",
    dateRange: { from: _range.from.toISOString(), to: _range.to.toISOString(), label: _range.label },
    data: {
      kpiValue: count,
      kpiDelta: "Prescriptions expiring soon",
    },
  };
}

// ── 6. Rx per Contact (avg) ─────────────────────────────────────────

export async function rxPerContact(_range: DateRange): Promise<ReportResult> {
  const totalRx = await aggregateCount(PRESCRIPTIONS_OBJECT_TYPE, [{
    filters: [],
  }]);

  const contactsWithRx = await getUniquePrescriptionPatientCount();

  const avg = contactsWithRx > 0 ? (totalRx / contactsWithRx).toFixed(1) : "0";

  return {
    reportId: "rx_per_contact",
    title: "Avg Rx per Patient",
    chartType: "kpi",
    dateRange: { from: _range.from.toISOString(), to: _range.to.toISOString(), label: _range.label },
    data: {
      kpiValue: avg,
      kpiDelta: `${totalRx} prescriptions / ${contactsWithRx} patients`,
    },
  };
}

// ── 7. Dispensing Rate ──────────────────────────────────────────────

export async function rxDispensingRate(_range: DateRange): Promise<ReportResult> {
  const fullyDispensed = await aggregateCount(PRESCRIPTIONS_OBJECT_TYPE, [{
    filters: [
      { propertyName: "prescription_status", operator: "EQ", value: "FULLY_DISPENSED" },
    ],
  }]);

  const total = await aggregateCount(PRESCRIPTIONS_OBJECT_TYPE, [{
    filters: [
      { propertyName: "prescription_status", operator: "NEQ", value: "EXPIRED" },
    ],
  }]);

  const rate = total > 0 ? ((fullyDispensed / total) * 100).toFixed(1) : "0";

  return {
    reportId: "rx_dispensing_rate",
    title: "Dispensing Rate",
    chartType: "kpi",
    dateRange: { from: _range.from.toISOString(), to: _range.to.toISOString(), label: _range.label },
    data: {
      kpiValue: `${rate}%`,
      kpiDelta: `${fullyDispensed} of ${total} fully dispensed (excl. expired)`,
    },
  };
}
