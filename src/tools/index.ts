/**
 * Tool registry — collects all tool definitions & provides lookup/execution.
 */

import { contactTools } from "./contacts.js";
import { dealTools } from "./deals.js";
import { prescriptionTools } from "./prescriptions.js";
import { lineItemTools } from "./line-items.js";
import { associationTools } from "./associations.js";
import { bulkTools } from "./bulk.js";
import { prescriptionWorkflowTools } from "./prescription-workflow.js";
import { reportTools } from "./reports.js";
import { taskTools } from "./tasks.js";
import { engagementTools } from "./engagements.js";

// ── Types ────────────────────────────────────────────────────────────

export interface ToolDef {
  name: string;
  description: string;
  isWrite: boolean;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

// ── Registry ─────────────────────────────────────────────────────────

const allTools: ToolDef[] = [
  ...contactTools,
  ...dealTools,
  ...prescriptionTools,
  ...lineItemTools,
  ...associationTools,
  ...bulkTools,
  ...prescriptionWorkflowTools,
  ...reportTools,
  ...taskTools,
  ...engagementTools,
];

const toolMap = new Map<string, ToolDef>(allTools.map((t) => [t.name, t]));

/** All tool definitions formatted for the Claude API `tools` parameter. */
export function getToolDefinitions() {
  return allTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}

/** Look up a tool by name. */
export function getTool(name: string): ToolDef | undefined {
  return toolMap.get(name);
}

/** Check if a tool is a write (destructive) operation. */
export function isWriteTool(name: string): boolean {
  return toolMap.get(name)?.isWrite ?? false;
}

/** Execute a tool and return the result as a string. */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  const tool = toolMap.get(name);
  if (!tool) return JSON.stringify({ error: `Unknown tool: ${name}` });

  try {
    const result = await tool.execute(input);
    return JSON.stringify(result, null, 2);
  } catch (err: any) {
    return JSON.stringify({
      error: err.message ?? String(err),
      tool: name,
    });
  }
}

// ── Coach-specific tool subset ───────────────────────────────────────

const COACH_TOOL_NAMES = new Set([
  "search_deals", "get_deal", "update_deal",
  "search_contacts", "get_contact",
  "count_deals_by_stage", "find_stale_deals",
  "get_associated_objects",
  "search_tasks", "create_task", "update_task",
  "get_recent_engagements", "get_meetings_today",
]);

/** Tool definitions filtered for the Coach agent (no prescriptions, reports, etc.). */
export function getCoachToolDefinitions() {
  return allTools
    .filter((t) => COACH_TOOL_NAMES.has(t.name))
    .map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
}

/** Execute a Coach-allowed tool. Rejects tools outside Coach's scope. */
export async function executeCoachTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (!COACH_TOOL_NAMES.has(name)) {
    return JSON.stringify({ error: `Tool "${name}" is not available to Coach` });
  }
  return executeTool(name, input);
}
