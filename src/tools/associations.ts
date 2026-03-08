/**
 * Association tools — query relationships between CRM objects
 */

import { getAssociations, batchRead } from "../hubspot/client.js";
import { PRESCRIPTIONS_OBJECT_TYPE, TREATMENT_PLAN_OBJECT_TYPE, stageName } from "../hubspot/types.js";
import type { ToolDef } from "./index.js";

// ── Friendly name mapping for object types ───────────────────────────

const OBJECT_TYPE_LABELS: Record<string, string> = {
  contacts: "Contact",
  deals: "Deal",
  line_items: "Line Item",
  [PRESCRIPTIONS_OBJECT_TYPE]: "Prescription",
  [TREATMENT_PLAN_OBJECT_TYPE]: "Treatment Plan",
};

// ── Tool definitions ─────────────────────────────────────────────────

export const associationTools: ToolDef[] = [
  {
    name: "get_associated_objects",
    description: `Get objects associated with a given CRM record. Use this to navigate relationships, e.g.:
- Contact's deals: from_type="contacts", from_id="123", to_type="deals"
- Deal's prescriptions: from_type="deals", from_id="456", to_type="${PRESCRIPTIONS_OBJECT_TYPE}"
- Deal's line items: from_type="deals", from_id="456", to_type="line_items"
- Contact's prescriptions: from_type="contacts", from_id="123", to_type="${PRESCRIPTIONS_OBJECT_TYPE}"
- Prescription's contact: from_type="${PRESCRIPTIONS_OBJECT_TYPE}", from_id="789", to_type="contacts"

Returns the IDs and basic properties of associated objects.`,
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {
        from_type: {
          type: "string",
          description: `Source object type: "contacts", "deals", "line_items", "${PRESCRIPTIONS_OBJECT_TYPE}" (prescriptions), or "${TREATMENT_PLAN_OBJECT_TYPE}" (treatment plans)`,
        },
        from_id: {
          type: "string",
          description: "Source object ID",
        },
        to_type: {
          type: "string",
          description: `Target object type: "contacts", "deals", "line_items", "${PRESCRIPTIONS_OBJECT_TYPE}" (prescriptions), or "${TREATMENT_PLAN_OBJECT_TYPE}" (treatment plans)`,
        },
        include_properties: {
          type: "boolean",
          description: "If true, fetch basic properties for each associated object (slower but more info). Default false.",
        },
      },
      required: ["from_type", "from_id", "to_type"],
    },
    execute: async (input: Record<string, unknown>) => {
      const { from_type, from_id, to_type, include_properties } = input as {
        from_type: string;
        from_id: string;
        to_type: string;
        include_properties?: boolean;
      };

      const res = await getAssociations(from_type, from_id, to_type);
      const ids = res.results.flatMap((r) => r.to.map((t) => t.toObjectId));

      if (ids.length === 0) {
        const fromLabel = OBJECT_TYPE_LABELS[from_type] ?? from_type;
        const toLabel = OBJECT_TYPE_LABELS[to_type] ?? to_type;
        return {
          total: 0,
          from: { type: fromLabel, id: from_id },
          associated: [],
          note: `No ${toLabel} records associated with this ${fromLabel}.`,
        };
      }

      // Optionally enrich with properties
      if (include_properties) {
        const propMap: Record<string, string[]> = {
          contacts: ["firstname", "lastname", "email"],
          deals: ["dealname", "dealstage", "amount", "createdate"],
          line_items: ["name", "quantity", "price"],
          [PRESCRIPTIONS_OBJECT_TYPE]: ["prescription_name", "prescription_status", "medication_name"],
          [TREATMENT_PLAN_OBJECT_TYPE]: ["hs_object_id"],
        };

        const objects = await batchRead(to_type, ids, propMap[to_type] ?? []);
        const enriched = objects.map((obj) => {
          const props: Record<string, unknown> = { id: obj.id, ...obj.properties };
          // Add stage label for deals
          if (to_type === "deals" && obj.properties.dealstage) {
            props._stageName = stageName(obj.properties.dealstage);
          }
          return props;
        });

        return {
          total: enriched.length,
          from: { type: OBJECT_TYPE_LABELS[from_type] ?? from_type, id: from_id },
          associated: enriched,
        };
      }

      return {
        total: ids.length,
        from: { type: OBJECT_TYPE_LABELS[from_type] ?? from_type, id: from_id },
        associatedIds: ids,
        note: "Set include_properties=true to fetch details for each object.",
      };
    },
  },
];
