/**
 * Coach orchestrator — schedule, execute, and manage Coach runs.
 */

import { runCoachAgent } from "./runner.js";
import { writeMemory, appendCompleted, loadMemory, writeCompleted } from "./state.js";
import { sendNotifications } from "./notifications.js";
import { getRunContext, detectRunMode, shouldRunNow } from "./prompts.js";
import type { RunMode, CoachRunLog, CoachStatus } from "./types.js";

// ── State ────────────────────────────────────────────────────────────

const runLogs: CoachRunLog[] = [];
let isRunning = false;
let enabled = true;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

const MAX_LOGS = 50;
const ONE_HOUR_MS = 60 * 60 * 1000;

// ── Execute a single Coach run ──────────────────────────────────────

export async function executeCoachRun(forceMode?: RunMode): Promise<CoachRunLog> {
  if (isRunning) {
    const skipLog: CoachRunLog = {
      timestamp: new Date().toISOString(),
      mode: "HOURLY",
      duration_ms: 0,
      toolCalls: 0,
      alertsResolved: 0,
      tasksCreated: 0,
      notificationsSent: 0,
      summary: "Skipped — previous run still in progress",
    };
    console.log("[COACH] Skipping run — already in progress");
    return skipLog;
  }

  isRunning = true;
  const startTime = Date.now();

  const ctx = getRunContext();
  const mode = forceMode ?? detectRunMode(ctx);

  console.log(`\n[COACH] ════════════════════════════════════════`);
  console.log(`[COACH] ${mode} run starting at ${ctx.currentTime}`);
  console.log(`[COACH] ════════════════════════════════════════`);

  const log: CoachRunLog = {
    timestamp: new Date().toISOString(),
    mode,
    duration_ms: 0,
    toolCalls: 0,
    alertsResolved: 0,
    tasksCreated: 0,
    notificationsSent: 0,
    summary: "",
  };

  try {
    const output = await runCoachAgent(mode);

    log.toolCalls = output.toolCalls;

    // Write MEMORY.md
    if (output.memoryUpdate) {
      writeMemory(output.memoryUpdate);
    }

    // Append resolved items to COMPLETED.md
    if (output.resolvedItems && output.resolvedItems.trim()) {
      appendCompleted(output.resolvedItems);
      // Count resolved items (rough: count lines starting with - or #)
      log.alertsResolved = (output.resolvedItems.match(/^[-#]/gm) || []).length;
    }

    // Send notifications
    if (output.notifications.length > 0) {
      log.notificationsSent = await sendNotifications(output.notifications);
    }

    // Handle weekly report
    if (output.weeklyReport) {
      console.log("\n[COACH] ═══ WEEKLY REPORT ═══");
      console.log(output.weeklyReport);
      console.log("[COACH] ═══ END WEEKLY REPORT ═══\n");

      // Send as notification too
      await sendNotifications([{
        urgency: "weekly",
        title: "Weekly Sales Performance Report",
        body: output.weeklyReport,
      }]);
    }

    // Set summary
    log.summary = output.runSummary ?? "Run completed (no summary block produced)";

    // Count tasks created (rough: count create_task tool calls in response)
    const taskMatches = output.rawResponse.match(/create_task/g);
    log.tasksCreated = taskMatches ? taskMatches.length : 0;

  } catch (err: any) {
    log.error = err.message ?? String(err);
    log.summary = `Run failed: ${log.error}`;
    console.error(`[COACH] Run failed:`, err);
  }

  log.duration_ms = Date.now() - startTime;
  isRunning = false;

  // Store log
  runLogs.unshift(log);
  if (runLogs.length > MAX_LOGS) runLogs.length = MAX_LOGS;

  console.log(`[COACH] ${mode} run completed in ${(log.duration_ms / 1000).toFixed(1)}s — ${log.toolCalls} tool calls`);
  if (log.summary) console.log(`[COACH] Summary: ${log.summary}`);

  return log;
}

// ── Scheduled run check ─────────────────────────────────────────────

async function runScheduledCheck(): Promise<void> {
  if (!enabled) return;

  const ctx = getRunContext();

  if (!shouldRunNow(ctx)) {
    console.log(`[COACH] Skipping — weekend, not a scheduled hour (${ctx.hour}:00 AEST)`);
    return;
  }

  try {
    await executeCoachRun();
  } catch (err: any) {
    console.error("[COACH] Scheduled run failed:", err.message);
  }
}

// ── Schedule control ────────────────────────────────────────────────

export function startCoachSchedule(): void {
  if (intervalHandle) return;

  enabled = true;
  intervalHandle = setInterval(runScheduledCheck, ONE_HOUR_MS);
  console.log("[COACH] Hourly schedule started (next run in ~1 hour)");
}

export function stopCoachSchedule(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  enabled = false;
  console.log("[COACH] Schedule stopped");
}

// ── Status & data accessors ─────────────────────────────────────────

export function getCoachStatus(): CoachStatus {
  return {
    enabled,
    lastRun: runLogs[0] ?? null,
    nextRunEstimate: intervalHandle
      ? new Date(Date.now() + ONE_HOUR_MS).toISOString()
      : null,
    totalRuns: runLogs.length,
  };
}

export function getCoachMemory(): string {
  return loadMemory();
}

export function getCoachLogs(limit = 20): CoachRunLog[] {
  return runLogs.slice(0, limit);
}
