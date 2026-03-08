import { batchRead, batchReadAssociations } from "../hubspot/client.js";
import { HUB_ID, UI_DOMAIN } from "../hubspot/types.js";

const TASK_PROPS = [
  "hs_task_subject",
  "hs_task_status",
  "hs_task_priority",
  "hs_task_type",
  "hs_timestamp",
  "hubspot_owner_id",
  "hs_createdate",
] as const;
const CACHE_TTL_MS = 2 * 60 * 1000;

interface CacheEntry {
  expiresAt: number;
  tasks: OpenTaskSummary[];
}

const taskCache = new Map<string, CacheEntry>();

export interface OpenTaskSummary {
  id: string;
  subject: string | null;
  status: string | null;
  priority: string | null;
  type: string | null;
  dueDate: string | null;
  ownerId: string | null;
  createdAt: string | null;
  url: string;
}

function isOpenTask(status: string | null | undefined): boolean {
  return Boolean(status && status !== "COMPLETED");
}

function getCached(contactId: string): OpenTaskSummary[] | null {
  const entry = taskCache.get(contactId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    taskCache.delete(contactId);
    return null;
  }
  return entry.tasks;
}

function setCached(contactId: string, tasks: OpenTaskSummary[]): void {
  taskCache.set(contactId, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    tasks,
  });
}

export function invalidateTaskGuard(contactId?: string): void {
  if (contactId) {
    taskCache.delete(contactId);
    return;
  }
  taskCache.clear();
}

export async function getOpenTasksByContactIds(
  contactIds: string[],
): Promise<Map<string, OpenTaskSummary[]>> {
  const uniqueContactIds = Array.from(new Set(contactIds.filter(Boolean)));
  const result = new Map<string, OpenTaskSummary[]>();

  if (uniqueContactIds.length === 0) return result;

  const missingIds: string[] = [];
  for (const contactId of uniqueContactIds) {
    const cached = getCached(contactId);
    if (cached !== null) {
      if (cached.length > 0) result.set(contactId, cached);
    } else {
      missingIds.push(contactId);
    }
  }

  if (missingIds.length === 0) return result;

  const assocRes = await batchReadAssociations("contacts", "tasks", missingIds);
  const taskIds = Array.from(new Set(
    assocRes.results.flatMap((entry) => entry.to.map((task) => task.toObjectId)),
  ));

  if (taskIds.length === 0) {
    for (const contactId of missingIds) setCached(contactId, []);
    return result;
  }

  const tasks = await batchRead("tasks", taskIds, [...TASK_PROPS]);
  const openTasksById = new Map<string, OpenTaskSummary>();

  for (const task of tasks) {
    if (!isOpenTask(task.properties.hs_task_status)) continue;
    openTasksById.set(task.id, {
      id: task.id,
      subject: task.properties.hs_task_subject ?? null,
      status: task.properties.hs_task_status ?? null,
      priority: task.properties.hs_task_priority ?? null,
      type: task.properties.hs_task_type ?? null,
      dueDate: task.properties.hs_timestamp ?? null,
      ownerId: task.properties.hubspot_owner_id ?? null,
      createdAt: task.properties.hs_createdate ?? null,
      url: `https://${UI_DOMAIN}/contacts/${HUB_ID}/task/${task.id}`,
    });
  }

  for (const entry of assocRes.results) {
    const openTasks = entry.to
      .map((task) => openTasksById.get(task.toObjectId))
      .filter((task): task is OpenTaskSummary => Boolean(task));

    setCached(entry.from.id, openTasks);
    if (openTasks.length > 0) {
      result.set(entry.from.id, openTasks);
    }
  }

  for (const contactId of missingIds) {
    if (!result.has(contactId) && getCached(contactId) === null) {
      setCached(contactId, []);
    }
  }

  return result;
}

export async function getFirstOpenTaskForContact(
  contactId: string,
): Promise<OpenTaskSummary | null> {
  const tasks = await getOpenTasksByContactIds([contactId]);
  return tasks.get(contactId)?.[0] ?? null;
}
