/**
 * Coach Sales Performance Agent — type definitions.
 */

export type RunMode = "HOURLY" | "MORNING_BRIEFING" | "WEEKEND_CHECK" | "WEEKLY_REPORT";

export interface Notification {
  urgency: "urgent" | "info" | "briefing" | "weekly";
  title: string;
  body: string;
}

export interface CoachOutput {
  memoryUpdate: string | null;
  resolvedItems: string | null;
  notifications: Notification[];
  runSummary: string | null;
  weeklyReport: string | null;
  rawResponse: string;
}

export interface CoachRunLog {
  timestamp: string;
  mode: RunMode;
  duration_ms: number;
  toolCalls: number;
  alertsResolved: number;
  tasksCreated: number;
  notificationsSent: number;
  summary: string;
  error?: string;
}

export interface CoachStatus {
  enabled: boolean;
  lastRun: CoachRunLog | null;
  nextRunEstimate: string | null;
  totalRuns: number;
}

export interface RunContext {
  currentTime: string;
  dayOfWeek: string;
  hour: number;
  isWeekend: boolean;
}
