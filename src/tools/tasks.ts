/**
 * Task tools — search, create, update HubSpot tasks.
 */

import { searchObjects, getObject, createObject, updateObject, createAssociation } from "../hubspot/client.js";
import { UI_DOMAIN, HUB_ID } from "../hubspot/types.js";
import type { SearchFilter } from "../hubspot/types.js";
import type { ToolDef } from "./index.js";

// ── Default properties ───────────────────────────────────────────────

const TASK_PROPS = [
  "hs_task_subject",
  "hs_task_body",
  "hs_task_status",
  "hs_task_priority",
  "hs_task_type",
  "hs_timestamp",
  "hubspot_owner_id",
  "hs_lastmodifieddate",
  "hs_createdate",
];

// ── Helpers ──────────────────────────────────────────────────────────

function formatTask(t: { id: string; properties: Record<string, string | null> }) {
  return {
    id: t.id,
    subject: t.properties.hs_task_subject,
    body: t.properties.hs_task_body,
    status: t.properties.hs_task_status,
    priority: t.properties.hs_task_priority,
    type: t.properties.hs_task_type,
    dueDate: t.properties.hs_timestamp,
    ownerId: t.properties.hubspot_owner_id,
    created: t.properties.hs_createdate,
    url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/task/${t.id}`,
  };
}

// ── Tool definitions ─────────────────────────────────────────────────

export const taskTools: ToolDef[] = [
  {
    name: "search_tasks",
    description:
      "Search HubSpot tasks by owner, status, or priority. Returns up to 50 matches with subject, status, priority, and due date.",
    isWrite: false,
    input_schema: {
      type: "object" as const,
      properties: {
        owner_id: {
          type: "string",
          description: "Filter tasks by HubSpot owner ID",
        },
        status: {
          type: "string",
          description:
            "Filter by status: NOT_STARTED, IN_PROGRESS, WAITING, COMPLETED, DEFERRED",
        },
        priority: {
          type: "string",
          description: "Filter by priority: LOW, MEDIUM, HIGH",
        },
        overdue_only: {
          type: "boolean",
          description: "If true, only return tasks whose due date is in the past",
        },
      },
    },
    async execute(input) {
      const filters: SearchFilter[] = [];

      if (input.owner_id) {
        filters.push({ propertyName: "hubspot_owner_id", operator: "EQ", value: String(input.owner_id) });
      }
      if (input.status) {
        filters.push({ propertyName: "hs_task_status", operator: "EQ", value: String(input.status) });
      }
      if (input.priority) {
        filters.push({ propertyName: "hs_task_priority", operator: "EQ", value: String(input.priority) });
      }
      if (input.overdue_only) {
        filters.push({
          propertyName: "hs_timestamp",
          operator: "LT",
          value: new Date().toISOString(),
        });
        // Also exclude completed tasks
        filters.push({ propertyName: "hs_task_status", operator: "NEQ", value: "COMPLETED" });
      }

      const res = await searchObjects("tasks", {
        filterGroups: filters.length > 0 ? [{ filters }] : undefined,
        properties: TASK_PROPS,
        limit: 50,
        sorts: [{ propertyName: "hs_timestamp", direction: "ASCENDING" }],
      });

      return {
        total: res.total,
        tasks: res.results.map(formatTask),
      };
    },
  },

  {
    name: "create_task",
    description:
      "Create a new task in HubSpot assigned to a specific owner. Can associate the task with a contact and/or deal.",
    isWrite: true,
    input_schema: {
      type: "object" as const,
      properties: {
        subject: {
          type: "string",
          description: "Task subject line — make it specific and actionable",
        },
        body: {
          type: "string",
          description: "Task body with context and instructions",
        },
        owner_id: {
          type: "string",
          description: "HubSpot owner ID to assign the task to",
        },
        priority: {
          type: "string",
          description: "Task priority: LOW, MEDIUM, or HIGH",
        },
        due_date: {
          type: "string",
          description: "Due date as ISO timestamp (e.g. 2026-03-10T09:00:00.000Z)",
        },
        task_type: {
          type: "string",
          description: "Task type: TODO, CALL, or EMAIL",
        },
        contact_id: {
          type: "string",
          description: "Optional: associate task with this contact ID",
        },
        deal_id: {
          type: "string",
          description: "Optional: associate task with this deal ID",
        },
      },
      required: ["subject", "owner_id"],
    },
    async execute(input) {
      const properties: Record<string, string> = {
        hs_task_subject: String(input.subject),
        hubspot_owner_id: String(input.owner_id),
        hs_task_status: "NOT_STARTED",
      };

      if (input.body) properties.hs_task_body = String(input.body);
      if (input.priority) properties.hs_task_priority = String(input.priority);
      if (input.task_type) properties.hs_task_type = String(input.task_type);
      if (input.due_date) properties.hs_timestamp = String(input.due_date);

      const task = await createObject("tasks", properties);

      // Associate with contact
      if (input.contact_id) {
        try {
          await createAssociation(
            "tasks", task.id,
            "contacts", String(input.contact_id),
            "HUBSPOT_DEFINED", 204,
          );
        } catch (err: any) {
          console.warn(`[TASK] Failed to associate task ${task.id} with contact ${input.contact_id}: ${err.message}`);
        }
      }

      // Associate with deal
      if (input.deal_id) {
        try {
          await createAssociation(
            "tasks", task.id,
            "deals", String(input.deal_id),
            "HUBSPOT_DEFINED", 216,
          );
        } catch (err: any) {
          console.warn(`[TASK] Failed to associate task ${task.id} with deal ${input.deal_id}: ${err.message}`);
        }
      }

      return {
        created: true,
        task: formatTask(task),
      };
    },
  },

  {
    name: "update_task",
    description: "Update an existing HubSpot task — change status, priority, due date, or subject.",
    isWrite: true,
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: {
          type: "string",
          description: "The HubSpot task ID to update",
        },
        status: {
          type: "string",
          description: "New status: NOT_STARTED, IN_PROGRESS, WAITING, COMPLETED, DEFERRED",
        },
        subject: {
          type: "string",
          description: "New task subject",
        },
        priority: {
          type: "string",
          description: "New priority: LOW, MEDIUM, HIGH",
        },
        due_date: {
          type: "string",
          description: "New due date as ISO timestamp",
        },
      },
      required: ["task_id"],
    },
    async execute(input) {
      const properties: Record<string, string> = {};
      if (input.status) properties.hs_task_status = String(input.status);
      if (input.subject) properties.hs_task_subject = String(input.subject);
      if (input.priority) properties.hs_task_priority = String(input.priority);
      if (input.due_date) properties.hs_timestamp = String(input.due_date);

      if (Object.keys(properties).length === 0) {
        return { error: "No properties to update" };
      }

      const task = await updateObject("tasks", String(input.task_id), properties);
      return { updated: true, task: formatTask(task) };
    },
  },
];
