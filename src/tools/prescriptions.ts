/**
 * Prescription tools — search, get, update
 * Prescriptions are a custom HubSpot object (2-222586633)
 */

import { searchObjects, getObject, updateObject } from "../hubspot/client.js";
import { PRESCRIPTIONS_OBJECT_TYPE, UI_DOMAIN, HUB_ID } from "../hubspot/types.js";
import type { ToolDef } from "./index.js";

// ── Default properties ───────────────────────────────────────────────

const RX_PROPS = [
  "hs_object_id", "createdate", "hs_lastmodifieddate",
  "prescription_name", "prescription_status",
  "medication_name", "dose", "frequency", "duration", "quantity",
  "instructions", "prescriber_name", "prescriber_date",
  "pz_prescription_id", "pz_legacy_id",
  "scriptpad_recipe_id", "scriptpad_status",
  "refill_count", "refill_remaining",
];

// ── Tool definitions ─────────────────────────────────────────────────

export const prescriptionTools: ToolDef[] = [
  {
    name: "search_prescriptions",
    description:
      "Search prescriptions (custom object). Can search by name, status, or free text. For prescriptions belonging to a specific contact or deal, use get_associations first to find linked prescription IDs, then use get_prescription.",
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Free-text search across prescription fields",
        },
        status: {
          type: "string",
          description: "Filter by prescription_status (e.g. 'active', 'cancelled', 'dispensed')",
        },
      },
      required: [],
    },
    execute: async (input: Record<string, unknown>) => {
      const { query, status } = input as {
        query?: string;
        status?: string;
      };

      const filters: any[] = [];
      if (status) {
        filters.push({ propertyName: "prescription_status", operator: "EQ", value: status });
      }

      const res = await searchObjects(PRESCRIPTIONS_OBJECT_TYPE, {
        ...(filters.length > 0 ? { filterGroups: [{ filters }] } : {}),
        ...(query ? { query } : {}),
        properties: RX_PROPS,
        limit: 10,
      });

      const prescriptions = res.results.map((rx) => ({
        id: rx.id,
        name: rx.properties.prescription_name ?? rx.properties.medication_name ?? "(unnamed)",
        status: rx.properties.prescription_status,
        medication: rx.properties.medication_name,
        dose: rx.properties.dose,
        frequency: rx.properties.frequency,
        created: rx.properties.createdate,
        url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/record/${PRESCRIPTIONS_OBJECT_TYPE}/${rx.id}`,
      }));

      return { total: res.total, showing: prescriptions.length, prescriptions };
    },
  },

  {
    name: "get_prescription",
    description:
      "Get full details for a single prescription by its HubSpot ID. Returns all medication, dosage, prescriber, and status fields.",
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {
        prescription_id: {
          type: "string",
          description: "The HubSpot prescription object ID",
        },
      },
      required: ["prescription_id"],
    },
    execute: async (input: Record<string, unknown>) => {
      const { prescription_id } = input as { prescription_id: string };
      const rx = await getObject(PRESCRIPTIONS_OBJECT_TYPE, prescription_id, RX_PROPS);
      return {
        id: rx.id,
        properties: rx.properties,
        url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/record/${PRESCRIPTIONS_OBJECT_TYPE}/${rx.id}`,
      };
    },
  },

  {
    name: "update_prescription",
    description:
      "Update properties on a prescription. WRITE operation — requires confirmation. Provide the prescription ID and a map of property names to new values.",
    isWrite: true,
    input_schema: {
      type: "object" as const,
      properties: {
        prescription_id: {
          type: "string",
          description: "The HubSpot prescription object ID to update",
        },
        properties: {
          type: "object",
          description:
            'Key-value map of properties to update, e.g. {"prescription_status": "dispensed"}',
          additionalProperties: { type: "string" },
        },
      },
      required: ["prescription_id", "properties"],
    },
    execute: async (input: Record<string, unknown>) => {
      const { prescription_id, properties } = input as {
        prescription_id: string;
        properties: Record<string, string>;
      };
      const updated = await updateObject(PRESCRIPTIONS_OBJECT_TYPE, prescription_id, properties);
      return {
        success: true,
        id: updated.id,
        updatedProperties: Object.keys(properties),
        url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/record/${PRESCRIPTIONS_OBJECT_TYPE}/${updated.id}`,
      };
    },
  },
];
