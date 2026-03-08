/**
 * REST API helpers — pipeline stats, object quick-view, reports.
 */

import { searchObjects, getObject, getAssociations, batchRead } from "./hubspot/client.js";
import {
  STAGES, PIPELINE_ID, stageName,
  PRESCRIPTIONS_OBJECT_TYPE,
  UI_DOMAIN, HUB_ID,
} from "./hubspot/types.js";
import {
  listReports as listAllReports,
  runReport as executeReport,
  runDashboard as executeDashboard,
  clearReportCache,
} from "./reports/index.js";
import { getSummaryKPIs } from "./reports/summary.js";
import { DASHBOARDS, type DashboardId } from "./reports/constants.js";
import type { DateRangeKey } from "./reports/date-ranges.js";

// ── Pipeline stats ───────────────────────────────────────────────────

interface StageStats {
  id: string;
  label: string;
  count: number;
  order: number;
}

export async function getPipelineStats(): Promise<{
  stages: StageStats[];
  total: number;
  timestamp: string;
}> {
  // Query each stage in parallel for speed
  const stageEntries = Object.values(STAGES);
  const results = await Promise.all(
    stageEntries.map(async (stage) => {
      const res = await searchObjects("deals", {
        filterGroups: [{
          filters: [
            { propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID },
            { propertyName: "dealstage", operator: "EQ", value: stage.id },
          ],
        }],
        limit: 1,
        properties: ["hs_object_id"],
      });
      return { ...stage, count: res.total };
    }),
  );

  const total = results.reduce((sum, s) => sum + s.count, 0);
  return {
    stages: results.sort((a, b) => a.order - b.order),
    total,
    timestamp: new Date().toISOString(),
  };
}

// ── Object quick-view ────────────────────────────────────────────────

const CONTACT_PROPS = [
  "firstname", "lastname", "email", "phone", "mobilephone",
  "lifecyclestage", "date_of_birth", "gender",
  "address", "city", "state", "zip", "country",
  "createdate", "lastmodifieddate",
  "pz_patient_id",
  "med_current_medications", "med_allergies", "med_medical_conditions",
];

const DEAL_PROPS = [
  "dealname", "dealstage", "pipeline", "amount", "closedate",
  "createdate", "hs_lastmodifieddate", "hubspot_owner_id",
  "shopify_checkout_url",
  "pz_repeats_allowed", "pz_repeats_used",
  "pz_repeat_interval_days", "pz_last_dispensed_date", "pz_next_unlock_date",
];

const RX_PROPS = [
  "prescription_name", "prescription_status",
  "medication_name", "dose", "frequency", "duration", "quantity",
  "instructions", "prescriber_name", "prescriber_date",
  "createdate", "hs_lastmodifieddate",
  "scriptpad_recipe_id", "scriptpad_status",
];

export async function getObjectDetails(
  objectType: string,
  objectId: string,
): Promise<Record<string, unknown>> {
  // Choose props based on type
  let props: string[];
  let urlPath: string;

  switch (objectType) {
    case "contacts":
      props = CONTACT_PROPS;
      urlPath = `contacts/${HUB_ID}/contact/${objectId}`;
      break;
    case "deals":
      props = DEAL_PROPS;
      urlPath = `contacts/${HUB_ID}/deal/${objectId}`;
      break;
    case PRESCRIPTIONS_OBJECT_TYPE:
    case "prescriptions":
      props = RX_PROPS;
      urlPath = `contacts/${HUB_ID}/record/${PRESCRIPTIONS_OBJECT_TYPE}/${objectId}`;
      break;
    default:
      props = [];
      urlPath = `contacts/${HUB_ID}/record/${objectType}/${objectId}`;
  }

  const actualType = objectType === "prescriptions" ? PRESCRIPTIONS_OBJECT_TYPE : objectType;
  const obj = await getObject(actualType, objectId, props);

  // Enrich deals with stage name
  if ((objectType === "deals") && obj.properties.dealstage) {
    (obj.properties as any)._stageName = stageName(obj.properties.dealstage);
  }

  // Fetch associations
  const associations: Record<string, string[]> = {};

  try {
    if (objectType === "contacts" || objectType === "deals") {
      // Get deal associations for contacts, contact associations for deals
      const assocType = objectType === "contacts" ? "deals" : "contacts";
      const assocRes = await getAssociations(actualType, objectId, assocType);
      associations[assocType] = assocRes.results.flatMap((r) => r.to.map((t) => t.toObjectId));
    }

    if (objectType === "deals") {
      // Get prescription associations
      const rxRes = await getAssociations("deals", objectId, PRESCRIPTIONS_OBJECT_TYPE);
      associations.prescriptions = rxRes.results.flatMap((r) => r.to.map((t) => t.toObjectId));

      // Get line item associations
      const liRes = await getAssociations("deals", objectId, "line_items");
      associations.lineItems = liRes.results.flatMap((r) => r.to.map((t) => t.toObjectId));
    }

    if (objectType === "contacts") {
      const rxRes = await getAssociations("contacts", objectId, PRESCRIPTIONS_OBJECT_TYPE);
      associations.prescriptions = rxRes.results.flatMap((r) => r.to.map((t) => t.toObjectId));
    }
  } catch {
    // Associations are best-effort
  }

  return {
    id: obj.id,
    objectType,
    properties: obj.properties,
    associations,
    url: `https://${UI_DOMAIN}/${urlPath}`,
  };
}

// ── Reports API ─────────────────────────────────────────────────────

/** List all available reports with metadata */
export function getReportsList() {
  return {
    dashboards: DASHBOARDS,
    reports: listAllReports(),
  };
}

/** Run all reports for a dashboard */
export async function getDashboardReports(
  dashboardId: string,
  rangeKey?: string,
  custom?: { from: string; to: string },
) {
  if (!DASHBOARDS[dashboardId as DashboardId]) {
    throw new Error(`Unknown dashboard: ${dashboardId}`);
  }
  return executeDashboard(
    dashboardId as DashboardId,
    (rangeKey as DateRangeKey) ?? "ltm",
    custom,
  );
}

/** Get summary KPIs */
export { getSummaryKPIs } from "./reports/summary.js";

/** Run a single report */
export async function getSingleReport(
  reportId: string,
  rangeKey?: string,
  custom?: { from: string; to: string },
) {
  return executeReport(
    reportId,
    rangeKey as DateRangeKey | undefined,
    custom,
  );
}

/** Clear all cached report data (Refresh button) */
export function clearAllCaches(): void {
  clearReportCache();
}
