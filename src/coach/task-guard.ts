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

export async function getOpenTasksByContactIds(
  contactIds: string[],
): Promise<Map<string, OpenTaskSummary[]>> {
  const uniqueContactIds = Array.from(new Set(contactIds.filter(Boolean)));
  const result = new Map<string, OpenTaskSummary[]>();

  if (uniqueContactIds.length === 0) return result;

  const assocRes = await batchReadAssociations("contacts", "tasks", uniqueContactIds);
  const taskIds = Array.from(new Set(
    assocRes.results.flatMap((entry) => entry.to.map((task) => task.toObjectId)),
  ));

  if (taskIds.length === 0) return result;

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

    if (openTasks.length > 0) {
      result.set(entry.from.id, openTasks);
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
