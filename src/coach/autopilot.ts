/**
 * Sales Coach Auto-Pilot — automatically creates tasks for HOT leads.
 *
 * Runs every 15 minutes (configurable). On each tick:
 *   1. Queries HubSpot for new contacts created in the last 20 minutes
 *   2. Checks for high-signal contacts (multi-signal, form + visit combo)
 *   3. Skips any contacts that already have an open HubSpot task
 *   4. Sends qualifying contacts to Claude for analysis
 *   5. Auto-creates HubSpot tasks for HOT-priority recommendations
 *   6. Logs everything — viewable in the UI
 *
 * Designed to complement, not replace, the manual Sales Coach UI.
 * The UI still shows all recommendations (hot + warm + follow-up).
 * Auto-pilot only acts on HOT leads automatically.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  searchObjects,
  getObject,
  getAssociations,
  createObject,
  createAssociation,
} from "../hubspot/client.js";
import { stageName, UI_DOMAIN, HUB_ID } from "../hubspot/types.js";
import type { SearchFilter } from "../hubspot/types.js";
import { toHsTimestamp } from "../reports/date-ranges.js";
import { getFirstOpenTaskForContact, getOpenTasksByContactIds, invalidateTaskGuard } from "./task-guard.js";
import { addAuditEvent, isSuppressed } from "./store.js";

// ── Types ────────────────────────────────────────────────────────────

export interface AutopilotTaskLog {
  timestamp: string;
  contactId: string;
  contactName: string;
  contactUrl: string;
  taskId: string;
  taskUrl: string;
  subject: string;
  actionType: string;
  signal: string;
}

export interface AutopilotRunLog {
  timestamp: string;
  duration_ms: number;
  contactsScanned: number;
  newLeadsFound: number;
  tasksCreated: number;
  skippedAlreadyTasked: number;
  error?: string;
}

export interface AutopilotStatus {
  enabled: boolean;
  intervalMinutes: number;
  lastRun: AutopilotRunLog | null;
  nextRunEstimate: string | null;
  totalRuns: number;
  totalTasksCreated: number;
  recentTasks: AutopilotTaskLog[];
}

// ── Config ───────────────────────────────────────────────────────────

const BEN_OWNER_ID = "161661298";
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const LOOKBACK_MINUTES = 20;                 // Query contacts from last 20 min (overlap buffer)
const MAX_TASKS_PER_RUN = 5;                 // Safety cap per run
const MAX_DAILY_TASKS = 25;                  // Safety cap per day

// ── Lazy Anthropic client ────────────────────────────────────────────

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

// ── State ────────────────────────────────────────────────────────────

let _enabled = false;
let _intervalMs = DEFAULT_INTERVAL_MS;
let _intervalHandle: ReturnType<typeof setInterval> | null = null;
let _isRunning = false;

const _runLogs: AutopilotRunLog[] = [];
const _taskLogs: AutopilotTaskLog[] = [];
const _taskedContactIds = new Set<string>(); // Contacts we've already created tasks for in this runtime
let _dailyTaskCount = 0;
let _dailyResetDate = new Date().toDateString();

const MAX_RUN_LOGS = 100;
const MAX_TASK_LOGS = 200;

// ── Contact properties ──────────────────────────────────────────────

const LEAD_PROPS = [
  "firstname", "lastname", "email", "phone", "mobilephone",
  "hs_analytics_num_page_views", "hs_analytics_num_visits",
  "hs_analytics_last_visit_timestamp", "hs_analytics_last_url",
  "hs_analytics_source",
  "notes_last_contacted",
  "num_conversion_events", "recent_conversion_date", "recent_conversion_event_name",
  "pz_engagement_score", "hubspotscore",
  "hs_lead_status", "lifecyclestage",
  "createdate", "lastmodifieddate",
];

// ── Daily task cap reset ────────────────────────────────────────────

function checkDailyReset(): void {
  const today = new Date().toDateString();
  if (today !== _dailyResetDate) {
    _dailyTaskCount = 0;
    _dailyResetDate = today;
    console.log("[AUTOPILOT] Daily task counter reset");
  }
}

// ── Core: find new leads that need tasks ────────────────────────────

interface NewLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  properties: Record<string, string | null>;
  signals: string[];
  deal: { id: string; name: string | null; stage: string | null } | null;
}

async function findNewLeads(): Promise<NewLead[]> {
  const lookbackDate = toHsTimestamp(new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000));

  // Two parallel queries: new contacts + recent form submissions
  const [newContacts, recentForms] = await Promise.all([
    // 1. Contacts created in the last 20 minutes — speed to lead
    searchObjects("contacts", {
      filterGroups: [{
        filters: [
          { propertyName: "createdate", operator: "GT", value: lookbackDate },
        ] as SearchFilter[],
      }],
      properties: LEAD_PROPS,
      limit: 30,
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
    }),

    // 2. Form submissions in last 20 min (may include existing contacts re-engaging)
    searchObjects("contacts", {
      filterGroups: [{
        filters: [
          { propertyName: "recent_conversion_date", operator: "GT", value: lookbackDate },
        ] as SearchFilter[],
      }],
      properties: LEAD_PROPS,
      limit: 20,
      sorts: [{ propertyName: "recent_conversion_date", direction: "DESCENDING" }],
    }),
  ]);

  // Deduplicate
  const leadMap = new Map<string, NewLead>();

  function addLeads(results: typeof newContacts.results, signal: string) {
    for (const c of results) {
      const name = `${c.properties.firstname ?? ""} ${c.properties.lastname ?? ""}`.trim();
      if (!name) continue;

      // Skip contacts we've already created tasks for in this runtime
      if (_taskedContactIds.has(c.id)) continue;

      const existing = leadMap.get(c.id);
      if (existing) {
        existing.signals.push(signal);
      } else {
        leadMap.set(c.id, {
          id: c.id,
          name,
          email: c.properties.email ?? null,
          phone: c.properties.phone ?? c.properties.mobilephone ?? null,
          properties: c.properties,
          signals: [signal],
          deal: null,
        });
      }
    }
  }

  addLeads(newContacts.results, "new_lead");
  addLeads(recentForms.results, "form_submission");

  const dedupedLeads = Array.from(leadMap.values());
  const openTasksByContact = await getOpenTasksByContactIds(dedupedLeads.map((lead) => lead.id));
  const leads = dedupedLeads.filter((lead) => !openTasksByContact.has(lead.id) && !isSuppressed(lead.id));

  // Enrich with deal data
  await Promise.all(
    leads.map(async (lead) => {
      try {
        const assocRes = await getAssociations("contacts", lead.id, "deals", 3);
        const dealIds = assocRes.results?.[0]?.to?.map((t) => t.toObjectId) ?? [];
        if (dealIds.length > 0) {
          const deal = await getObject("deals", dealIds[0], [
            "dealname", "dealstage", "amount", "pipeline",
          ]);
          lead.deal = {
            id: deal.id,
            name: deal.properties.dealname ?? null,
            stage: stageName(deal.properties.dealstage ?? ""),
          };
        }
      } catch {
        // Non-critical — proceed without deal data
      }
    }),
  );

  return leads;
}

// ── Claude prompt for auto-pilot (more concise than full Sales Coach) ─

const AUTOPILOT_SYSTEM = `You are the Sales Coach Auto-Pilot for Primal Zone — an Australian TRT telehealth clinic.

Your job: analyse new leads and produce task recommendations for Ben (the sales rep). These tasks will be AUTOMATICALLY created in HubSpot, so only recommend contacts that GENUINELY need immediate follow-up.

## Rules
- Only recommend contacts that are genuinely HOT — new enquiries, form submissions, or high-signal re-engagement
- Skip contacts that look like test/spam (fake names, disposable emails)
- Each task must have a specific, actionable subject and body
- Write in Ben's voice: casual Australian, direct, warm ("mate", "no worries", "let's get you sorted")
- Phone-first for contacts with phone numbers; email-first if no phone
- Maximum ${MAX_TASKS_PER_RUN} recommendations per run

For each recommendation, return a JSON object with:
- contactId: string (MUST match one from the data)
- actionType: "CALL" | "EMAIL"
- title: short task subject (e.g. "Call Josh — new TRT enquiry, just submitted quiz")
- taskBody: 3-5 lines with context, approach, and an opening line/message
- signal: 1 sentence explaining why this needs immediate action

Respond with ONLY a JSON array. Empty array [] if no leads warrant a task.`;

// ── Generate and create tasks ───────────────────────────────────────

async function analyseAndCreateTasks(leads: NewLead[]): Promise<AutopilotTaskLog[]> {
  if (leads.length === 0) return [];

  const contactPayload = leads.map((c) => ({
    contactId: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    signals: c.signals,
    deal: c.deal,
    pageViews: c.properties.hs_analytics_num_page_views,
    sessions: c.properties.hs_analytics_num_visits,
    lastVisit: c.properties.hs_analytics_last_visit_timestamp,
    lastPageSeen: c.properties.hs_analytics_last_url,
    trafficSource: c.properties.hs_analytics_source,
    lastContacted: c.properties.notes_last_contacted,
    formSubmissions: c.properties.num_conversion_events,
    recentConversion: c.properties.recent_conversion_event_name,
    engagementScore: c.properties.pz_engagement_score,
    created: c.properties.createdate,
  }));

  const now = new Date().toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    dateStyle: "full",
    timeStyle: "short",
  });

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: AUTOPILOT_SYSTEM,
    messages: [{
      role: "user",
      content: `Current time: ${now}\n\n${leads.length} new leads detected:\n${JSON.stringify(contactPayload, null, 2)}\n\nWhich contacts need immediate tasks for Ben?`,
    }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];

  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let recs: any[];
  try {
    recs = JSON.parse(jsonStr);
  } catch {
    console.warn("[AUTOPILOT] Failed to parse Claude response as JSON");
    return [];
  }

  if (!Array.isArray(recs) || recs.length === 0) return [];

  // Cap per run
  recs = recs.slice(0, MAX_TASKS_PER_RUN);

  // Create tasks
  const taskLogs: AutopilotTaskLog[] = [];

  for (const rec of recs) {
    // Daily cap check
    checkDailyReset();
    if (_dailyTaskCount >= MAX_DAILY_TASKS) {
      console.log("[AUTOPILOT] Daily task cap reached — stopping task creation");
      break;
    }

    const lead = leads.find((l) => l.id === rec.contactId);
    if (!lead) continue;

    // Skip if we've already tasked this contact (runtime guard)
    if (_taskedContactIds.has(lead.id)) continue;

    // Skip if HubSpot already has an open task for this contact
    const existingTask = await getFirstOpenTaskForContact(lead.id);
    if (existingTask) continue;

    try {
      // Due date: today + 2 hours (urgent follow-up)
      const dueDate = new Date(Date.now() + 2 * 60 * 60 * 1000);

      const task = await createObject("tasks", {
        hs_task_subject: rec.title ?? `Follow up with ${lead.name}`,
        hs_task_body: rec.taskBody ?? `New lead — ${lead.signals.join(", ")}. Follow up ASAP.`,
        hubspot_owner_id: BEN_OWNER_ID,
        hs_task_priority: "HIGH",
        hs_task_type: rec.actionType ?? "CALL",
        hs_task_status: "NOT_STARTED",
        hs_timestamp: dueDate.toISOString(),
      });

      // Associate with contact
      try {
        await createAssociation("tasks", task.id, "contacts", lead.id, "HUBSPOT_DEFINED", 204);
      } catch { /* non-critical */ }

      // Associate with deal
      if (lead.deal?.id) {
        try {
          await createAssociation("tasks", task.id, "deals", lead.deal.id, "HUBSPOT_DEFINED", 216);
        } catch { /* non-critical */ }
      }

      // Track
      _taskedContactIds.add(lead.id);
      invalidateTaskGuard(lead.id);
      _dailyTaskCount++;

      const taskLog: AutopilotTaskLog = {
        timestamp: new Date().toISOString(),
        contactId: lead.id,
        contactName: lead.name,
        contactUrl: `https://${UI_DOMAIN}/contacts/${HUB_ID}/contact/${lead.id}`,
        taskId: task.id,
        taskUrl: `https://${UI_DOMAIN}/contacts/${HUB_ID}/task/${task.id}`,
        subject: rec.title ?? `Follow up with ${lead.name}`,
        actionType: rec.actionType ?? "CALL",
        signal: rec.signal ?? lead.signals.join(", "),
      };

      _taskLogs.unshift(taskLog);
      if (_taskLogs.length > MAX_TASK_LOGS) _taskLogs.length = MAX_TASK_LOGS;

      taskLogs.push(taskLog);

      addAuditEvent({
        type: "task_auto_created",
        contactId: lead.id,
        contactName: lead.name,
        message: `Auto-Pilot created task for ${lead.name}`,
        metadata: { taskId: task.id, actionType: rec.actionType ?? "CALL" },
      });

      console.log(
        `[AUTOPILOT] ✅ Task created: "${rec.title}" for ${lead.name} (ID: ${task.id})`,
      );
    } catch (err: any) {
      console.error(`[AUTOPILOT] Failed to create task for ${lead.name}:`, err.message);
    }
  }

  return taskLogs;
}

// ── Core scan logic (no schedule guards) ────────────────────────────

async function runCoreScan(): Promise<AutopilotRunLog> {
  if (_isRunning) {
    return {
      timestamp: new Date().toISOString(),
      duration_ms: 0,
      contactsScanned: 0,
      newLeadsFound: 0,
      tasksCreated: 0,
      skippedAlreadyTasked: 0,
      error: "Skipped — already running",
    };
  }

  _isRunning = true;
  const startTime = Date.now();

  const log: AutopilotRunLog = {
    timestamp: new Date().toISOString(),
    duration_ms: 0,
    contactsScanned: 0,
    newLeadsFound: 0,
    tasksCreated: 0,
    skippedAlreadyTasked: 0,
  };

  try {
    console.log("[AUTOPILOT] Scanning for new leads...");

    const leads = await findNewLeads();
    log.contactsScanned = leads.length + _taskedContactIds.size;
    log.newLeadsFound = leads.length;
    log.skippedAlreadyTasked = _taskedContactIds.size;

    if (leads.length > 0) {
      console.log(`[AUTOPILOT] ${leads.length} new leads found — analysing...`);
      const taskLogs = await analyseAndCreateTasks(leads);
      log.tasksCreated = taskLogs.length;
    } else {
      console.log("[AUTOPILOT] No new leads detected");
    }
  } catch (err: any) {
    log.error = err.message ?? String(err);
    console.error("[AUTOPILOT] Run failed:", err.message);
  }

  log.duration_ms = Date.now() - startTime;
  _isRunning = false;

  _runLogs.unshift(log);
  if (_runLogs.length > MAX_RUN_LOGS) _runLogs.length = MAX_RUN_LOGS;

  if (log.tasksCreated > 0) {
    console.log(
      `[AUTOPILOT] Run complete: ${log.tasksCreated} tasks created in ${(log.duration_ms / 1000).toFixed(1)}s`,
    );
  }

  return log;
}

// ── Scheduled tick (with business hour guards) ──────────────────────

async function runAutopilotTick(): Promise<void> {
  if (!_enabled) return;

  // Don't run on weekends
  const day = new Date().toLocaleDateString("en-AU", {
    timeZone: "Australia/Sydney",
    weekday: "short",
  });
  if (day === "Sat" || day === "Sun") return;

  // Only run during business hours (7am - 7pm AEST)
  const hour = parseInt(
    new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hour12: false }),
    10,
  );
  if (hour < 7 || hour >= 19) return;

  await runCoreScan();
}

// ── Schedule control ────────────────────────────────────────────────

export function startAutopilot(intervalMinutes?: number): void {
  if (_intervalHandle) return; // Already running

  if (intervalMinutes && intervalMinutes >= 5) {
    _intervalMs = intervalMinutes * 60 * 1000;
  }

  _enabled = true;
  _intervalHandle = setInterval(runAutopilotTick, _intervalMs);

  const mins = Math.round(_intervalMs / 60000);
  console.log(`[AUTOPILOT] Started — scanning every ${mins} minutes during business hours`);
}

export function stopAutopilot(): void {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
  }
  _enabled = false;
  console.log("[AUTOPILOT] Stopped");
}

export function isAutopilotEnabled(): boolean {
  return _enabled;
}

// ── Manual trigger (for testing) ────────────────────────────────────

export async function runAutopilotNow(): Promise<AutopilotRunLog> {
  return runCoreScan(); // Bypasses weekend/business-hour guards
}

// ── Status & logs ───────────────────────────────────────────────────

export function getAutopilotStatus(): AutopilotStatus {
  return {
    enabled: _enabled,
    intervalMinutes: Math.round(_intervalMs / 60000),
    lastRun: _runLogs[0] ?? null,
    nextRunEstimate: _intervalHandle
      ? new Date(Date.now() + _intervalMs).toISOString()
      : null,
    totalRuns: _runLogs.length,
    totalTasksCreated: _taskLogs.length,
    recentTasks: _taskLogs.slice(0, 20),
  };
}

export function getAutopilotLogs(limit = 20): AutopilotRunLog[] {
  return _runLogs.slice(0, limit);
}

export function getAutopilotTasks(limit = 50): AutopilotTaskLog[] {
  return _taskLogs.slice(0, limit);
}
