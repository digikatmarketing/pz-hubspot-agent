/**
 * Coach prompt builder — constructs the system + user prompt for each run mode.
 */

import type { RunMode, RunContext } from "./types.js";
import { loadSoul, loadMemory, loadCompleted } from "./state.js";

// ── AEST context helper ─────────────────────────────────────────────

export function getRunContext(): RunContext {
  const now = new Date();
  const aestOpts: Intl.DateTimeFormatOptions = { timeZone: "Australia/Sydney" };

  const currentTime = now.toLocaleString("en-AU", {
    ...aestOpts,
    dateStyle: "full",
    timeStyle: "long",
  });

  const dayOfWeek = now.toLocaleDateString("en-AU", {
    ...aestOpts,
    weekday: "long",
  });

  const hour = parseInt(
    now.toLocaleString("en-AU", {
      ...aestOpts,
      hour: "numeric",
      hour12: false,
    }),
    10,
  );

  const isWeekend = dayOfWeek === "Saturday" || dayOfWeek === "Sunday";

  return { currentTime, dayOfWeek, hour, isWeekend };
}

// ── Detect run mode from time ────────────────────────────────────────

export function detectRunMode(ctx: RunContext): RunMode {
  if (ctx.isWeekend) return "WEEKEND_CHECK";
  if (ctx.dayOfWeek === "Friday" && ctx.hour >= 16) return "WEEKLY_REPORT";
  if (ctx.hour >= 6 && ctx.hour <= 8) return "MORNING_BRIEFING";
  return "HOURLY";
}

// ── Should this scheduled run execute? ───────────────────────────────

export function shouldRunNow(ctx: RunContext): boolean {
  if (!ctx.isWeekend) return true;
  // Weekend: only run at 9am and 4pm AEST
  return ctx.hour === 9 || ctx.hour === 16;
}

// ── Output block instructions (appended to all prompts) ─────────────

const OUTPUT_FORMAT = `
## Required Output Format

You MUST include ALL of these blocks in your response:

<MEMORY_UPDATE>
[Complete replacement content for MEMORY.md — include ALL active alerts, pipeline snapshot, activity tracker, pending tasks, run log, and observations. This replaces the entire file.]
</MEMORY_UPDATE>

<RESOLVED_ITEMS>
[Any items from MEMORY.md that are now resolved. Include: alert ID, type, resolution details, timestamp. Leave empty if nothing was resolved.]
</RESOLVED_ITEMS>

<NOTIFICATIONS>
[JSON array of notifications to send. Each object: {"urgency": "urgent|info|briefing|weekly", "title": "short title", "body": "detailed message"}. Use empty array [] if no notifications needed.]
</NOTIFICATIONS>

<RUN_SUMMARY>
[2-3 sentence summary of what happened this run — how many deals checked, alerts raised/resolved, tasks created, notable findings.]
</RUN_SUMMARY>
`;

// ── Build the full prompt for a Coach run ────────────────────────────

export function buildCoachPrompt(mode: RunMode): {
  system: string;
  userMessage: string;
} {
  const ctx = getRunContext();
  const soul = loadSoul();
  const memory = loadMemory();

  let userMessage = "";

  switch (mode) {
    case "HOURLY":
      userMessage = `COACH RUN — HOURLY CHECK
Timestamp: ${ctx.currentTime}
Day: ${ctx.dayOfWeek}

## Current Memory State

${memory}

## Instructions

Execute your standard hourly protocol:

1. Query HubSpot for ALL deals in the Primal Zone sales pipeline (pipeline ID: 2063105729)
2. Query for contacts created in the last 70 minutes (overlap window)
3. Query Ben's open tasks (owner ID: ${process.env.COACH_BEN_OWNER_ID || "161661298"})
4. Query Ben's recent engagements (calls, emails, meetings, notes) from the last 70 minutes
5. Query Ben's meetings for today

Then analyse:
- Score each deal's health using the scoring system in your instructions
- Check stage SLAs — flag overdue deals
- Check for new uncontacted leads (should be contacted within 1 hour)
- Check Ben's activity against targets (15 calls/day, 10 emails/day)
- Cross-reference with MEMORY.md — have any previous alerts been resolved?
- Create HubSpot tasks for any new issues found

${OUTPUT_FORMAT}`;
      break;

    case "MORNING_BRIEFING":
      userMessage = `COACH RUN — MORNING BRIEFING
Timestamp: ${ctx.currentTime}
Day: ${ctx.dayOfWeek}

## Current Memory State

${memory}

## Instructions

Execute your standard hourly protocol (full pipeline scan, activity check, deal health scoring, task creation), PLUS generate a morning briefing for Ben.

The briefing should include:
- Today's meetings with context and prep notes
- Priority actions ranked by urgency
- Pipeline snapshot (total active deals, at risk, critical)
- Overdue items and tasks
- Yesterday's activity summary (calls, emails, meetings vs targets)
- A motivating but honest opening line for Ben

Include the briefing in the NOTIFICATIONS block with urgency "briefing".

Query HubSpot (owner ID: ${process.env.COACH_BEN_OWNER_ID || "161661298"}, pipeline ID: 2063105729):
1. All pipeline deals
2. New contacts (last 70 minutes)
3. Ben's open tasks
4. Ben's yesterday activity (calls, emails, meetings, notes since yesterday 00:00 AEST)
5. Ben's meetings today

${OUTPUT_FORMAT}`;
      break;

    case "WEEKEND_CHECK":
      userMessage = `COACH RUN — WEEKEND CHECK
Timestamp: ${ctx.currentTime}
Day: ${ctx.dayOfWeek}

## Current Memory State

${memory}

## Instructions

This is a WEEKEND run. Reporting and monitoring only — do NOT create any new tasks in HubSpot.

Query HubSpot (owner ID: ${process.env.COACH_BEN_OWNER_ID || "161661298"}, pipeline ID: 2063105729):
1. All pipeline deals — check for any critical changes
2. Any new contacts that arrived over the weekend

Update your MEMORY.md with current pipeline state. Note any critical items that will need attention on Monday.

If any deals have become critically overdue or new high-value leads have come in, include a notification with urgency "info" — but do NOT create tasks.

${OUTPUT_FORMAT}`;
      break;

    case "WEEKLY_REPORT": {
      const completed = loadCompleted();
      userMessage = `COACH RUN — WEEKLY REPORT
Timestamp: ${ctx.currentTime}
Day: ${ctx.dayOfWeek}

## Current Memory State

${memory}

## Completed Items This Week

${completed}

## Instructions

Execute your standard hourly protocol, PLUS generate the weekly performance report.

Using the COMPLETED.md data and your current MEMORY.md state:
1. Calculate weekly metrics: deals won/lost, activity totals, task completion rate
2. Identify the bottleneck stage this week
3. Assess Ben's performance honestly but constructively
4. Note any patterns or trends
5. Recommend 3 priority items for next week
6. Generate the full weekly report

Query HubSpot (owner ID: ${process.env.COACH_BEN_OWNER_ID || "161661298"}, pipeline ID: 2063105729):
1. All pipeline deals
2. Ben's activity for the full week
3. Open tasks

Include the weekly report in a <WEEKLY_REPORT> block:

<WEEKLY_REPORT>
[Full formatted weekly report with metrics, scorecard, pipeline health, assessment, and priorities for next week]
</WEEKLY_REPORT>

${OUTPUT_FORMAT}`;
      break;
    }
  }

  return { system: soul, userMessage };
}
