/**
 * Report-specific pipeline & stage constants.
 * Sales pipeline constants are in src/hubspot/types.ts — these cover Order & Rx pipelines.
 */

// ── Order Pipeline (orders object type, NOT deals) ─────────────────
// Orders are a native HubSpot "orders" object (type 0-123), synced from Shopify.
// Revenue reports should query this object type, not deals.

export const ORDER_PIPELINE_ID = "14a2e10e-5471-408a-906e-c51f3b04369e";
export const ORDERS_OBJECT_TYPE = "orders";

export const ORDER_STAGES: Record<string, { id: string; label: string; order: number }> = {
  "4b27b500-f031-4927-9811-68a0b525cbae": { id: "4b27b500-f031-4927-9811-68a0b525cbae", label: "Open",       order: 1 },
  "937ea84d-0a4f-4dcf-9028-3f9c2aafbf03": { id: "937ea84d-0a4f-4dcf-9028-3f9c2aafbf03", label: "Processed",  order: 2 },
  "aa99e8d0-c1d5-4071-b915-d240bbb1aed9": { id: "aa99e8d0-c1d5-4071-b915-d240bbb1aed9", label: "Shipped",    order: 3 },
  "3725360f-519b-4b18-a593-494d60a29c9f": { id: "3725360f-519b-4b18-a593-494d60a29c9f", label: "Delivered",  order: 4 },
  "3c85a297-e9ce-400b-b42e-9f16853d69d6": { id: "3c85a297-e9ce-400b-b42e-9f16853d69d6", label: "Cancelled",  order: 5 },
};

// ── Prescription Statuses ───────────────────────────────────────────
// These are values of the `prescription_status` property on the custom Rx object.

export const RX_STATUSES = [
  "active",
  "partially_dispensed",
  "expiring_soon",
  "fully_dispensed",
  "expired",
  "cancelled",
] as const;

export const RX_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  PARTIALLY_DISPENSED: "Partially Dispensed",
  EXPIRING_SOON: "Expiring Soon",
  FULLY_DISPENSED: "Fully Dispensed",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
  // Lowercase fallbacks
  active: "Active",
  partially_dispensed: "Partially Dispensed",
  expiring_soon: "Expiring Soon",
  fully_dispensed: "Fully Dispensed",
  expired: "Expired",
  cancelled: "Cancelled",
};

// ── Australian State Labels ─────────────────────────────────────────

export const AU_STATE_LABELS: Record<string, string> = {
  "New South Wales": "NSW",
  "Victoria": "VIC",
  "Queensland": "QLD",
  "Western Australia": "WA",
  "South Australia": "SA",
  "Tasmania": "TAS",
  "Australian Capital Territory": "ACT",
  "Northern Territory": "NT",
};

// ── Dashboard IDs ───────────────────────────────────────────────────

export type DashboardId = "executive" | "operations" | "prescriptions";

export const DASHBOARDS: Record<DashboardId, { label: string; description: string }> = {
  executive: {
    label: "Executive",
    description: "Revenue, patients, conversion — high-level business metrics",
  },
  operations: {
    label: "Operations",
    description: "Pipeline health, orders, tickets, team performance",
  },
  prescriptions: {
    label: "Prescriptions",
    description: "Rx status, medications, dispensing rates",
  },
};

// ── Chart types ─────────────────────────────────────────────────────

export type ChartType = "bar" | "line" | "doughnut" | "funnel" | "kpi" | "table";
