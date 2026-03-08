/**
 * Coach notification dispatcher — console logging + optional Slack webhook.
 */

import type { Notification } from "./types.js";

// ── Console formatting ──────────────────────────────────────────────

const URGENCY_LABELS: Record<string, string> = {
  urgent:   "🔴 URGENT",
  info:     "🔵 INFO",
  briefing: "🟢 BRIEFING",
  weekly:   "🟣 WEEKLY",
};

function logNotification(n: Notification): void {
  const label = URGENCY_LABELS[n.urgency] ?? n.urgency.toUpperCase();
  console.log(`\n[COACH/NOTIFY] ${label} — ${n.title}`);
  console.log(`  ${n.body.replace(/\n/g, "\n  ")}`);
}

// ── Slack (placeholder — ready for webhook URL) ─────────────────────

async function sendSlack(n: Notification): Promise<void> {
  const webhookUrl = process.env.COACH_SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const colorMap: Record<string, string> = {
    urgent:   "#ef4444",
    info:     "#3b82f6",
    briefing: "#22c55e",
    weekly:   "#a855f7",
  };

  const payload = {
    attachments: [
      {
        color: colorMap[n.urgency] ?? "#6b7280",
        title: `Coach: ${n.title}`,
        text: n.body,
        footer: "PZ HubSpot Agent — Coach",
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`[COACH/SLACK] Webhook returned ${res.status}: ${await res.text()}`);
    }
  } catch (err: any) {
    console.warn(`[COACH/SLACK] Failed to send: ${err.message}`);
  }
}

// ── Public API ──────────────────────────────────────────────────────

export async function sendNotifications(notifications: Notification[]): Promise<number> {
  let sent = 0;

  for (const n of notifications) {
    logNotification(n);
    await sendSlack(n);
    sent++;
  }

  if (sent > 0) {
    console.log(`[COACH] ${sent} notification(s) dispatched`);
  }

  return sent;
}
