import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";

export interface SuppressionRecord {
  contactId: string;
  contactName: string;
  reason: string;
  source: "sales_coach" | "manual";
  createdAt: string;
  until: string | null;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  type:
    | "task_created"
    | "task_existing"
    | "task_auto_created"
    | "recommendation_suppressed"
    | "suppression_cleared";
  contactId?: string;
  contactName?: string;
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
}

interface CoachStateFile {
  suppressions: Record<string, SuppressionRecord>;
  auditLog: AuditEvent[];
}

const STATE_FILE = resolve(process.cwd(), ".coach-state.json");
const MAX_AUDIT_EVENTS = 300;

let state: CoachStateFile = {
  suppressions: {},
  auditLog: [],
};

function ensureDir(): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
}

function persist(): void {
  ensureDir();
  const temp = `${STATE_FILE}.tmp`;
  writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
  renameSync(temp, STATE_FILE);
}

function cleanupExpiredSuppressions(): void {
  const now = Date.now();
  let changed = false;
  for (const [contactId, suppression] of Object.entries(state.suppressions)) {
    if (suppression.until && new Date(suppression.until).getTime() <= now) {
      delete state.suppressions[contactId];
      changed = true;
    }
  }
  if (changed) persist();
}

function loadState(): void {
  if (!existsSync(STATE_FILE)) return;
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, "utf8")) as Partial<CoachStateFile>;
    state = {
      suppressions: parsed.suppressions ?? {},
      auditLog: parsed.auditLog ?? [],
    };
    cleanupExpiredSuppressions();
  } catch (err: any) {
    console.warn(`[COACH] Failed to load state: ${err?.message ?? err}`);
  }
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

loadState();

export function getSuppressions(): SuppressionRecord[] {
  cleanupExpiredSuppressions();
  return Object.values(state.suppressions).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function isSuppressed(contactId: string): boolean {
  cleanupExpiredSuppressions();
  return Boolean(state.suppressions[contactId]);
}

export function suppressContact(input: {
  contactId: string;
  contactName: string;
  reason: string;
  source?: "sales_coach" | "manual";
  days?: number;
}): SuppressionRecord {
  const days = input.days ?? 7;
  const until = days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null;
  const record: SuppressionRecord = {
    contactId: input.contactId,
    contactName: input.contactName,
    reason: input.reason,
    source: input.source ?? "manual",
    createdAt: new Date().toISOString(),
    until,
  };
  state.suppressions[input.contactId] = record;
  persist();
  return record;
}

export function clearSuppression(contactId: string): boolean {
  if (!state.suppressions[contactId]) return false;
  delete state.suppressions[contactId];
  persist();
  return true;
}

export function addAuditEvent(event: Omit<AuditEvent, "id" | "timestamp">): AuditEvent {
  const entry: AuditEvent = {
    id: makeId(),
    timestamp: new Date().toISOString(),
    ...event,
  };
  state.auditLog.unshift(entry);
  if (state.auditLog.length > MAX_AUDIT_EVENTS) {
    state.auditLog.length = MAX_AUDIT_EVENTS;
  }
  persist();
  return entry;
}

export function getAuditLog(limit = 50): AuditEvent[] {
  return state.auditLog.slice(0, limit);
}
