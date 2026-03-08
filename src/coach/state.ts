/**
 * Coach state management — read/write SOUL.md, MEMORY.md, COMPLETED.md
 * and parse structured output blocks from Claude responses.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { CoachOutput, Notification } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Data directory ───────────────────────────────────────────────────

// Project root = two levels up from dist/coach/ (or src/coach/)
const projectRoot = resolve(__dirname, "..", "..");

function dataDir(): string {
  const envDir = process.env.COACH_DATA_DIR;
  if (envDir) {
    // If absolute, use as-is; if relative, resolve from project root
    return resolve(projectRoot, envDir);
  }
  // Default: src/coach/data relative to project root
  return resolve(projectRoot, "src", "coach", "data");
}

function ensureDataDir(): void {
  const dir = dataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function filePath(name: string): string {
  return resolve(dataDir(), name);
}

// ── SOUL.md (cached — loaded once) ──────────────────────────────────

let _soulCache: string | null = null;

export function loadSoul(): string {
  if (_soulCache) return _soulCache;

  const path = filePath("SOUL.md");
  if (!existsSync(path)) {
    throw new Error(`[COACH] SOUL.md not found at ${path}`);
  }
  _soulCache = readFileSync(path, "utf-8");
  return _soulCache;
}

// ── MEMORY.md (read fresh each run) ─────────────────────────────────

export function loadMemory(): string {
  const path = filePath("MEMORY.md");
  if (!existsSync(path)) {
    return "# Coach Memory — Active Items\n\n_No previous state._\n";
  }
  return readFileSync(path, "utf-8");
}

export function writeMemory(content: string): void {
  ensureDataDir();
  writeFileSync(filePath("MEMORY.md"), content, "utf-8");
  console.log("[COACH] MEMORY.md updated");
}

// ── COMPLETED.md (append resolved items) ────────────────────────────

export function loadCompleted(): string {
  const path = filePath("COMPLETED.md");
  if (!existsSync(path)) {
    return "# Coach — Completed Items Archive\n\n_No resolved items yet._\n";
  }
  return readFileSync(path, "utf-8");
}

export function appendCompleted(content: string): void {
  ensureDataDir();
  const path = filePath("COMPLETED.md");
  const existing = existsSync(path) ? readFileSync(path, "utf-8") : "";
  const separator = "\n\n---\n\n";
  const timestamp = new Date().toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    dateStyle: "full",
    timeStyle: "long",
  });

  const entry = `## Resolved — ${timestamp}\n\n${content.trim()}`;
  writeFileSync(path, existing + separator + entry, "utf-8");
  console.log("[COACH] COMPLETED.md updated with resolved items");
}

export function writeCompleted(content: string): void {
  ensureDataDir();
  writeFileSync(filePath("COMPLETED.md"), content, "utf-8");
  console.log("[COACH] COMPLETED.md replaced (weekly archive)");
}

// ── Parse structured output blocks from Claude response ─────────────

function extractBlock(text: string, blockName: string): string | null {
  const regex = new RegExp(`<${blockName}>([\\s\\S]*?)<\\/${blockName}>`, "i");
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

function parseNotifications(raw: string | null): Notification[] {
  if (!raw || !raw.trim()) return [];

  try {
    // Try JSON array first
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  } catch {
    // Fallback: treat as plain text notification
    return [{ urgency: "info", title: "Coach Update", body: raw }];
  }
}

export function parseCoachOutput(rawResponse: string): CoachOutput {
  return {
    memoryUpdate: extractBlock(rawResponse, "MEMORY_UPDATE"),
    resolvedItems: extractBlock(rawResponse, "RESOLVED_ITEMS"),
    notifications: parseNotifications(extractBlock(rawResponse, "NOTIFICATIONS")),
    runSummary: extractBlock(rawResponse, "RUN_SUMMARY"),
    weeklyReport: extractBlock(rawResponse, "WEEKLY_REPORT"),
    rawResponse,
  };
}
