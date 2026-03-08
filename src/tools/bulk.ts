/**
 * Bulk operation tools — stale deals, contacts without deals, stage summary
 */

import { searchObjects } from "../hubspot/client.js";
import { STAGES, PIPELINE_ID, stageName, UI_DOMAIN, HUB_ID } from "../hubspot/types.js";
import type { ToolDef } from "./index.js";

// ── Tool definitions ─────────────────────────────────────────────────

export const bulkTools: ToolDef[] = [
  {
    name: "count_deals_by_stage",
    description:
      "Get a count of deals in every pipeline stage. Returns a summary table showing how many deals are in each stage. Useful for pipeline overview questions.",
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
    execute: async () => {
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
          return { stage: stage.label, stageId: stage.id, count: res.total, order: stage.order };
        }),
      );

      const sorted = results.sort((a, b) => a.order - b.order);
      const total = sorted.reduce((sum, s) => sum + s.count, 0);

      return { stages: sorted, totalDeals: total };
    },
  },

  {
    name: "find_stale_deals",
    description:
      "Find deals that have been sitting in a specific stage for longer than a given number of days. Useful for finding stuck/forgotten deals. Returns up to 20 results sorted by oldest first.",
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {
        stage: {
          type: "string",
          description:
            "Stage name (Lead, Meeting Booked, Application, Submission Check, Consultant, Doctor Review) or stage ID",
        },
        days: {
          type: "number",
          description: "Minimum number of days the deal has been in this stage (default: 30)",
        },
        limit: {
          type: "number",
          description: "Max results to return (default: 20, max: 50)",
        },
      },
      required: ["stage"],
    },
    execute: async (input: Record<string, unknown>) => {
      const { stage, days = 30, limit = 20 } = input as {
        stage: string;
        days?: number;
        limit?: number;
      };

      // Resolve stage
      const stageEntry = Object.values(STAGES).find(
        (s) => s.label.toLowerCase() === (stage as string).toLowerCase() || s.id === stage,
      );
      if (!stageEntry) {
        return { error: `Unknown stage "${stage}". Valid: ${Object.values(STAGES).map((s) => s.label).join(", ")}` };
      }

      // Calculate cutoff date
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (days as number));
      const cutoffStr = cutoff.getTime().toString();

      const res = await searchObjects("deals", {
        filterGroups: [{
          filters: [
            { propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID },
            { propertyName: "dealstage", operator: "EQ", value: stageEntry.id },
            { propertyName: "createdate", operator: "LT", value: cutoffStr },
          ],
        }],
        properties: ["dealname", "dealstage", "createdate", "amount", "hubspot_owner_id"],
        limit: Math.min(limit as number, 50),
        sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
      });

      const deals = res.results.map((d) => {
        const created = new Date(d.properties.createdate ?? "");
        const daysOld = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: d.id,
          name: d.properties.dealname,
          daysOld,
          created: d.properties.createdate,
          amount: d.properties.amount,
          url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/deal/${d.id}`,
        };
      });

      return {
        stage: stageEntry.label,
        minDays: days,
        total: res.total,
        showing: deals.length,
        deals,
      };
    },
  },

  {
    name: "find_recent_deals",
    description:
      "Find the most recently created or modified deals. Useful for seeing latest activity. Returns up to 20 results.",
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {
        sort_by: {
          type: "string",
          description: 'Sort by "created" (default) or "modified"',
        },
        stage: {
          type: "string",
          description: "Optionally filter to a specific stage name or ID",
        },
        limit: {
          type: "number",
          description: "Max results (default: 10, max: 20)",
        },
      },
      required: [],
    },
    execute: async (input: Record<string, unknown>) => {
      const { sort_by = "created", stage, limit = 10 } = input as {
        sort_by?: string;
        stage?: string;
        limit?: number;
      };

      const filters: any[] = [
        { propertyName: "pipeline", operator: "EQ", value: PIPELINE_ID },
      ];

      if (stage) {
        const stageEntry = Object.values(STAGES).find(
          (s) => s.label.toLowerCase() === stage.toLowerCase() || s.id === stage,
        );
        if (stageEntry) {
          filters.push({ propertyName: "dealstage", operator: "EQ", value: stageEntry.id });
        }
      }

      const sortProp = sort_by === "modified" ? "hs_lastmodifieddate" : "createdate";

      const res = await searchObjects("deals", {
        filterGroups: [{ filters }],
        properties: ["dealname", "dealstage", "createdate", "hs_lastmodifieddate", "amount"],
        limit: Math.min(limit, 20),
        sorts: [{ propertyName: sortProp, direction: "DESCENDING" }],
      });

      const deals = res.results.map((d) => ({
        id: d.id,
        name: d.properties.dealname,
        stage: stageName(d.properties.dealstage ?? ""),
        created: d.properties.createdate,
        modified: d.properties.hs_lastmodifieddate,
        amount: d.properties.amount,
        url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/deal/${d.id}`,
      }));

      return { total: res.total, showing: deals.length, deals };
    },
  },

  {
    name: "search_contacts_advanced",
    description:
      "Advanced contact search with filters. Find contacts by lifecycle stage, creation date range, or that have/don't have certain properties populated.",
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {
        lifecycle_stage: {
          type: "string",
          description: 'Filter by lifecycle stage (e.g. "lead", "customer", "subscriber")',
        },
        created_after: {
          type: "string",
          description: "Only contacts created after this date (YYYY-MM-DD)",
        },
        created_before: {
          type: "string",
          description: "Only contacts created before this date (YYYY-MM-DD)",
        },
        has_property: {
          type: "string",
          description: "Only contacts that have this property filled in",
        },
        missing_property: {
          type: "string",
          description: "Only contacts that are missing this property",
        },
        limit: {
          type: "number",
          description: "Max results (default: 10, max: 50)",
        },
      },
      required: [],
    },
    execute: async (input: Record<string, unknown>) => {
      const {
        lifecycle_stage, created_after, created_before,
        has_property, missing_property, limit = 10,
      } = input as Record<string, any>;

      const filters: any[] = [];
      if (lifecycle_stage) {
        filters.push({ propertyName: "lifecyclestage", operator: "EQ", value: lifecycle_stage });
      }
      if (created_after) {
        filters.push({ propertyName: "createdate", operator: "GTE", value: new Date(created_after).getTime().toString() });
      }
      if (created_before) {
        filters.push({ propertyName: "createdate", operator: "LTE", value: new Date(created_before).getTime().toString() });
      }
      if (has_property) {
        filters.push({ propertyName: has_property, operator: "HAS_PROPERTY" });
      }
      if (missing_property) {
        filters.push({ propertyName: missing_property, operator: "NOT_HAS_PROPERTY" });
      }

      if (filters.length === 0) {
        return { error: "At least one filter is required." };
      }

      const res = await searchObjects("contacts", {
        filterGroups: [{ filters }],
        properties: ["firstname", "lastname", "email", "phone", "lifecyclestage", "createdate"],
        limit: Math.min(limit, 50),
        sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      });

      const contacts = res.results.map((c) => ({
        id: c.id,
        name: `${c.properties.firstname ?? ""} ${c.properties.lastname ?? ""}`.trim() || "(no name)",
        email: c.properties.email,
        phone: c.properties.phone,
        stage: c.properties.lifecyclestage,
        created: c.properties.createdate,
        url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/contact/${c.id}`,
      }));

      return { total: res.total, showing: contacts.length, contacts };
    },
  },
];
