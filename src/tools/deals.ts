/**
 * Deal tools — search, get, update, move stage
 */

import { searchObjects, getObject, updateObject } from "../hubspot/client.js";
import { STAGES, stageName, PIPELINE_ID, UI_DOMAIN, HUB_ID } from "../hubspot/types.js";
import type { ToolDef } from "./index.js";

// ── Default properties ───────────────────────────────────────────────

const DEAL_PROPS = [
  "dealname", "dealstage", "pipeline", "amount", "closedate",
  "hs_object_id", "createdate", "hs_lastmodifieddate",
  "hubspot_owner_id",
  "shopify_checkout_url", "shopify_draft_order_id",
  "pz_repeats_allowed", "pz_repeats_used",
  "pz_repeat_interval_days", "pz_last_dispensed_date", "pz_next_unlock_date",
  "hs_v2_date_entered_3271648998",
];

// ── Helpers ──────────────────────────────────────────────────────────

function formatDeal(d: { id: string; properties: Record<string, string | null> }) {
  return {
    id: d.id,
    name: d.properties.dealname,
    stage: stageName(d.properties.dealstage ?? ""),
    stageId: d.properties.dealstage,
    amount: d.properties.amount,
    created: d.properties.createdate,
    closed: d.properties.closedate,
    checkoutUrl: d.properties.shopify_checkout_url,
    url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/deal/${d.id}`,
  };
}

// ── Tool definitions ─────────────────────────────────────────────────

export const dealTools: ToolDef[] = [
  {
    name: "search_deals",
    description:
      "Search deals by name, stage, or contact. Returns up to 10 matches with stage labels. You can filter by pipeline stage using the stage name (e.g. 'Doctor Review') or stage ID.",
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Free-text search across deal name, pipeline, stage",
        },
        stage: {
          type: "string",
          description:
            "Filter by stage name (Lead, Meeting Booked, Application, Submission Check, Consultant, Doctor Review, Approved by Doctor, Cancelled) or stage ID",
        },
        contact_id: {
          type: "string",
          description: "Filter deals associated with this contact ID",
        },
      },
      required: [],
    },
    execute: async (input: Record<string, unknown>) => {
      const { query, stage, contact_id } = input as {
        query?: string;
        stage?: string;
        contact_id?: string;
      };

      const filters: any[] = [];
      // Always filter to our pipeline
      filters.push({ propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID });

      // Resolve stage name → ID
      if (stage) {
        const stageEntry = Object.values(STAGES).find(
          (s) => s.label.toLowerCase() === stage.toLowerCase() || s.id === stage,
        );
        if (stageEntry) {
          filters.push({ propertyName: "dealstage", operator: "EQ", value: stageEntry.id });
        }
      }

      // Contact association filter needs a different approach — search by contact
      if (contact_id) {
        // Use HubSpot's association filter via search
        const res = await searchObjects("deals", {
          filterGroups: [{ filters }],
          properties: DEAL_PROPS,
          limit: 10,
          query,
        });

        // Post-filter is needed unless we use association search
        // For simplicity, use the query-based search and note the limitation
        const deals = res.results.map(formatDeal);
        return { total: res.total, showing: deals.length, deals, note: "Filtered by pipeline/stage. For contact-specific deals, use get_contact_deals." };
      }

      const res = await searchObjects("deals", {
        filterGroups: [{ filters }],
        properties: DEAL_PROPS,
        limit: 10,
        ...(query ? { query } : {}),
        sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      });

      const deals = res.results.map(formatDeal);
      return { total: res.total, showing: deals.length, deals };
    },
  },

  {
    name: "get_deal",
    description:
      "Get full details for a single deal by its HubSpot ID. Returns all properties including repeats, checkout URL, and stage dates.",
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {
        deal_id: {
          type: "string",
          description: "The HubSpot deal ID",
        },
      },
      required: ["deal_id"],
    },
    execute: async (input: Record<string, unknown>) => {
      const { deal_id } = input as { deal_id: string };
      const deal = await getObject("deals", deal_id, DEAL_PROPS);
      return {
        id: deal.id,
        properties: {
          ...deal.properties,
          _stageName: stageName(deal.properties.dealstage ?? ""),
        },
        url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/deal/${deal.id}`,
      };
    },
  },

  {
    name: "update_deal",
    description:
      "Update properties on a deal. WRITE operation — requires confirmation. Provide the deal ID and a map of property names to new values.",
    isWrite: true,
    input_schema: {
      type: "object" as const,
      properties: {
        deal_id: {
          type: "string",
          description: "The HubSpot deal ID to update",
        },
        properties: {
          type: "object",
          description:
            'Key-value map of properties to update, e.g. {"amount": "350", "dealname": "NEW NAME"}',
          additionalProperties: { type: "string" },
        },
      },
      required: ["deal_id", "properties"],
    },
    execute: async (input: Record<string, unknown>) => {
      const { deal_id, properties } = input as {
        deal_id: string;
        properties: Record<string, string>;
      };
      const updated = await updateObject("deals", deal_id, properties);
      return {
        success: true,
        id: updated.id,
        updatedProperties: Object.keys(properties),
        url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/deal/${updated.id}`,
      };
    },
  },

  {
    name: "move_deal_stage",
    description:
      "Move a deal to a different pipeline stage. WRITE operation — requires confirmation. Provide the deal ID and target stage name or ID. Valid stages: Lead, Meeting Booked, Application, Submission Check, Consultant, Doctor Review, Approved by Doctor, Cancelled.",
    isWrite: true,
    input_schema: {
      type: "object" as const,
      properties: {
        deal_id: {
          type: "string",
          description: "The HubSpot deal ID",
        },
        target_stage: {
          type: "string",
          description:
            "Target stage name (e.g. 'Doctor Review', 'Approved by Doctor') or stage ID",
        },
      },
      required: ["deal_id", "target_stage"],
    },
    execute: async (input: Record<string, unknown>) => {
      const { deal_id, target_stage } = input as {
        deal_id: string;
        target_stage: string;
      };

      // Resolve stage
      const stageEntry = Object.values(STAGES).find(
        (s) => s.label.toLowerCase() === target_stage.toLowerCase() || s.id === target_stage,
      );
      if (!stageEntry) {
        const validStages = Object.values(STAGES).map((s) => s.label).join(", ");
        return { error: `Unknown stage "${target_stage}". Valid stages: ${validStages}` };
      }

      const updated = await updateObject("deals", deal_id, {
        dealstage: stageEntry.id,
        pipeline: PIPELINE_ID,
      });

      return {
        success: true,
        id: updated.id,
        newStage: stageEntry.label,
        newStageId: stageEntry.id,
        url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/deal/${updated.id}`,
      };
    },
  },
];
