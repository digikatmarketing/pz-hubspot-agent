/**
 * Engagement tools — recent activities (calls, emails, meetings, notes).
 */

import { searchObjects, getAssociations } from "../hubspot/client.js";
import type { ToolDef } from "./index.js";

// ── Property maps per engagement type ────────────────────────────────

const CALL_PROPS = [
  "hs_call_title", "hs_call_duration", "hs_call_direction",
  "hs_call_status", "hs_timestamp", "hubspot_owner_id", "hs_createdate",
];

const EMAIL_PROPS = [
  "hs_email_subject", "hs_email_direction", "hs_email_status",
  "hs_timestamp", "hubspot_owner_id", "hs_createdate",
];

const MEETING_PROPS = [
  "hs_meeting_title", "hs_meeting_start_time", "hs_meeting_end_time",
  "hs_meeting_outcome", "hs_timestamp", "hubspot_owner_id", "hs_createdate",
];

const NOTE_PROPS = [
  "hs_note_body", "hs_timestamp", "hubspot_owner_id", "hs_createdate",
];

// ── Helpers ──────────────────────────────────────────────────────────

function truncate(str: string | null | undefined, maxLen = 200): string {
  if (!str) return "";
  return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
}

// ── Tool definitions ─────────────────────────────────────────────────

export const engagementTools: ToolDef[] = [
  {
    name: "get_recent_engagements",
    description:
      "Get recent activity counts and details for a HubSpot owner — calls, emails, meetings, and notes since a given timestamp. Useful for checking a sales rep's activity volume.",
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {
        owner_id: {
          type: "string",
          description: "HubSpot owner ID to look up activities for",
        },
        since: {
          type: "string",
          description:
            "ISO timestamp — only return activities created after this time (e.g. 2026-03-08T00:00:00.000Z). Defaults to 24 hours ago.",
        },
        types: {
          type: "array",
          items: { type: "string" },
          description:
            'Which activity types to include. Defaults to all: ["calls", "emails", "meetings", "notes"]',
        },
      },
      required: ["owner_id"],
    },
    async execute(input) {
      const ownerId = String(input.owner_id);
      const since = input.since
        ? String(input.since)
        : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const types = (input.types as string[] | undefined) ?? [
        "calls", "emails", "meetings", "notes",
      ];

      const baseFilters = [
        { propertyName: "hubspot_owner_id", operator: "EQ" as const, value: ownerId },
        { propertyName: "hs_createdate", operator: "GTE" as const, value: since },
      ];

      const results: Record<string, { count: number; items: unknown[] }> = {};

      for (const type of types) {
        let props: string[];
        switch (type) {
          case "calls": props = CALL_PROPS; break;
          case "emails": props = EMAIL_PROPS; break;
          case "meetings": props = MEETING_PROPS; break;
          case "notes": props = NOTE_PROPS; break;
          default: continue;
        }

        try {
          const res = await searchObjects(type, {
            filterGroups: [{ filters: baseFilters }],
            properties: props,
            limit: 50,
            sorts: [{ propertyName: "hs_createdate", direction: "DESCENDING" }],
          });

          const items = res.results.map((r) => {
            const out: Record<string, string | null> = { id: r.id };
            for (const p of props) {
              const val = r.properties[p];
              out[p] = p === "hs_note_body" ? truncate(val) : val;
            }
            return out;
          });

          results[type] = { count: res.total, items };
        } catch (err: any) {
          results[type] = { count: 0, items: [{ error: err.message }] };
        }
      }

      // Build summary
      const summary = Object.entries(results)
        .map(([type, data]) => `${type}: ${data.count}`)
        .join(", ");

      return { since, ownerId, summary, activities: results };
    },
  },

  {
    name: "get_meetings_today",
    description:
      "Get meetings scheduled for a specific owner on a given date. Returns meeting details with associated contacts.",
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {
        owner_id: {
          type: "string",
          description: "HubSpot owner ID",
        },
        date: {
          type: "string",
          description:
            "Date in YYYY-MM-DD format. Defaults to today (AEST).",
        },
      },
      required: ["owner_id"],
    },
    async execute(input) {
      const ownerId = String(input.owner_id);

      // Default to today in AEST
      const dateStr = input.date
        ? String(input.date)
        : new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

      const dayStart = `${dateStr}T00:00:00.000Z`;
      const dayEnd = `${dateStr}T23:59:59.999Z`;

      const res = await searchObjects("meetings", {
        filterGroups: [
          {
            filters: [
              { propertyName: "hubspot_owner_id", operator: "EQ", value: ownerId },
              { propertyName: "hs_meeting_start_time", operator: "GTE", value: dayStart },
              { propertyName: "hs_meeting_start_time", operator: "LTE", value: dayEnd },
            ],
          },
        ],
        properties: MEETING_PROPS,
        limit: 20,
        sorts: [{ propertyName: "hs_meeting_start_time", direction: "ASCENDING" }],
      });

      // Enrich with associated contacts
      const meetings = [];
      for (const m of res.results) {
        let contacts: Array<{ id: string }> = [];
        try {
          const assoc = await getAssociations("meetings", m.id, "contacts", 10);
          contacts = assoc.results.flatMap((r) =>
            r.to.map((t) => ({ id: t.toObjectId })),
          );
        } catch {
          // Ignore association lookup failures
        }

        meetings.push({
          id: m.id,
          title: m.properties.hs_meeting_title,
          start: m.properties.hs_meeting_start_time,
          end: m.properties.hs_meeting_end_time,
          outcome: m.properties.hs_meeting_outcome,
          associatedContacts: contacts,
        });
      }

      return {
        date: dateStr,
        ownerId,
        total: res.total,
        meetings,
      };
    },
  },
];
