import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import type { CoachOutput, Notification } from "./types.js";

const DATA_DIR = resolve(process.cwd(), "src/coach/data");
const SOUL_FILE = resolve(DATA_DIR, "SOUL.md");
const MEMORY_FILE = resolve(DATA_DIR, "MEMORY.md");
const COMPLETED_FILE = resolve(DATA_DIR, "COMPLETED.md");

function readFileOrEmpty(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function extractBlock(text: string, tag: string): string | null {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`, "i"));
  return match ? match[1].trim() : null;
}

export function loadSoul(): string {
  return readFileOrEmpty(SOUL_FILE);
}

export function loadMemory(): string {
  return readFileOrEmpty(MEMORY_FILE);
}

export function writeMemory(content: string): void {
  writeFileSync(MEMORY_FILE, content.trim() + "\n");
}

export function loadCompleted(): string {
  return readFileOrEmpty(COMPLETED_FILE);
}

export function writeCompleted(content: string): void {
  writeFileSync(COMPLETED_FILE, content.trim() + "\n");
}

export function appendCompleted(content: string): void {
  const existing = loadCompleted().trimEnd();
  const next = existing ? `${existing}\n\n${content.trim()}\n` : `${content.trim()}\n`;
  writeCompleted(next);
}

export function parseCoachOutput(rawResponse: string): CoachOutput {
  const memoryUpdate = extractBlock(rawResponse, "MEMORY_UPDATE");
  const resolvedItems = extractBlock(rawResponse, "RESOLVED_ITEMS");
  const notificationsBlock = extractBlock(rawResponse, "NOTIFICATIONS");
  const runSummary = extractBlock(rawResponse, "RUN_SUMMARY");
  const weeklyReport = extractBlock(rawResponse, "WEEKLY_REPORT");

  let notifications: Notification[] = [];
  if (notificationsBlock) {
    try {
      notifications = JSON.parse(notificationsBlock) as Notification[];
    } catch {
      notifications = [];
    }
  }

  return {
    memoryUpdate,
    resolvedItems,
    notifications,
    runSummary,
    weeklyReport,
    rawResponse,
  };
}
