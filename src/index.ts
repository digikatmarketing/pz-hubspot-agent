/**
 * PZ HubSpot Support Agent — Express + WebSocket entry point.
 */

import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { handleConnection } from "./gateway.js";
import {
  getPipelineStats,
  getObjectDetails,
  getReportsList,
  getDashboardReports,
  getSingleReport,
  getSummaryKPIs,
  clearAllCaches,
} from "./api.js";
import { warmAllReports } from "./reports/index.js";
import { generateRecommendations, getRecommendations } from "./recommendations.js";
import {
  authMiddleware,
  handleLogin,
  handleLogout,
  handleAuthCheck,
  isValidToken,
  getTokenFromUpgrade,
} from "./auth.js";
import {
  executeCoachRun,
  startCoachSchedule,
  stopCoachSchedule,
  getCoachStatus,
  getCoachMemory,
  getCoachLogs,
} from "./coach/index.js";
import {
  generateSalesRecommendations,
  getSalesRecommendations,
  isSalesCoachCacheValid,
  activateRecommendation,
  suppressRecommendation,
  listSalesCoachSuppressions,
  clearSuppressedSalesCoachContact,
} from "./coach/recommendations.js";
import { getAuditLog } from "./coach/store.js";
import {
  startAutopilot,
  stopAutopilot,
  getAutopilotStatus,
  getAutopilotLogs,
  getAutopilotTasks,
  runAutopilotNow,
} from "./coach/autopilot.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve the UI directory — works from both src/ (tsx dev) and dist/ (compiled)
const uiDir = existsSync(resolve(__dirname, "ui", "index.html"))
  ? resolve(__dirname, "ui")
  : resolve(__dirname, "..", "src", "ui");

// Load .env — try multiple paths to handle different execution contexts
const envCandidates = [
  resolve(__dirname, "..", ".env"),
  resolve(__dirname, ".env"),
  resolve(process.cwd(), ".env"),
];
const envFile = envCandidates.find((p) => existsSync(p));
if (envFile) {
  dotenv.config({ path: envFile, override: true });
} else {
  dotenv.config({ override: true });
}
const PORT = parseInt(process.env.PORT ?? "3847", 10);

// ── Validate required env vars ───────────────────────────────────────

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY in .env");
  process.exit(1);
}
if (!process.env.HUBSPOT_ACCESS_TOKEN) {
  console.error("Missing HUBSPOT_ACCESS_TOKEN in .env");
  process.exit(1);
}
if (!process.env.APP_PASSWORD) {
  console.error("Missing APP_PASSWORD in .env");
  process.exit(1);
}

// ── Express app ──────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Auth routes (public — no middleware)
app.post("/api/auth/login", handleLogin);
app.post("/api/auth/logout", handleLogout);
app.get("/api/auth/check", handleAuthCheck);

// Auth middleware — protects everything below
app.use(authMiddleware);

// Serve chat UI
app.get("/", (_req, res) => {
  res.sendFile(resolve(uiDir, "index.html"));
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Pipeline stats for dashboard
app.get("/api/pipeline-stats", async (_req, res) => {
  try {
    const stats = await getPipelineStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Quick-view object details
app.get("/api/object/:objectType/:objectId", async (req, res) => {
  try {
    const data = await getObjectDetails(req.params.objectType, req.params.objectId);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reports: list all
app.get("/api/reports/list", (_req, res) => {
  res.json(getReportsList());
});

// Reports: clear all caches (Refresh button)
app.post("/api/reports/cache/clear", (_req, res) => {
  clearAllCaches();
  res.json({ ok: true });
});

// Reports: summary KPIs (always-visible row)
app.get("/api/reports/summary", async (_req, res) => {
  try {
    const data = await getSummaryKPIs();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Actions: AI recommended actions
app.get("/api/actions", async (_req, res) => {
  let data = getRecommendations();
  if (!data) {
    // Cache empty — trigger generation and wait for it
    console.log("[ACTIONS] Cache miss — generating recommendations on demand...");
    try {
      data = await generateRecommendations();
    } catch (err: any) {
      console.error("[ACTIONS] On-demand generation failed:", err?.message);
    }
  }
  if (!data) {
    res.json({ status: "pending", message: "Reports are still loading. Recommendations will be generated shortly." });
  } else {
    res.json(data);
  }
});

// Actions: force regeneration
app.post("/api/actions/generate", async (_req, res) => {
  try {
    const data = await generateRecommendations();
    if (!data) {
      res.json({ status: "pending", message: "No report data available yet. Warm reports first." });
    } else {
      res.json(data);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reports: run all for a dashboard
app.get("/api/reports/:dashboardId", async (req, res) => {
  try {
    const { range, from, to } = req.query as Record<string, string>;
    const custom = from && to ? { from, to } : undefined;
    const data = await getDashboardReports(req.params.dashboardId, range, custom);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reports: run single report
app.get("/api/reports/:dashboardId/:reportId", async (req, res) => {
  try {
    const { range, from, to } = req.query as Record<string, string>;
    const custom = from && to ? { from, to } : undefined;
    const data = await getSingleReport(req.params.reportId, range, custom);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Coach API endpoints ──────────────────────────────────────────────

app.get("/api/coach/status", (_req, res) => {
  res.json(getCoachStatus());
});

app.get("/api/coach/memory", (_req, res) => {
  res.json({ memory: getCoachMemory() });
});

app.get("/api/coach/log", (req, res) => {
  const limit = parseInt((req.query as any).limit ?? "20", 10);
  res.json({ logs: getCoachLogs(limit) });
});

app.post("/api/coach/run", async (req, res) => {
  try {
    const mode = (req.body as any)?.mode; // optional: HOURLY, MORNING_BRIEFING, etc.
    const log = await executeCoachRun(mode);
    res.json(log);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/coach/schedule/start", (_req, res) => {
  startCoachSchedule();
  res.json({ ok: true, message: "Coach schedule started" });
});

app.post("/api/coach/schedule/stop", (_req, res) => {
  stopCoachSchedule();
  res.json({ ok: true, message: "Coach schedule stopped" });
});

// ── Sales Coach — Hot Lead Recommendations ───────────────────────────

app.get("/api/coach/recommendations", async (_req, res) => {
  try {
    if (isSalesCoachCacheValid()) {
      res.json(getSalesRecommendations());
    } else {
      const data = await generateSalesRecommendations();
      res.json(data);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/coach/recommendations/generate", async (_req, res) => {
  try {
    const data = await generateSalesRecommendations();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/coach/recommendations/:index/activate", async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const rec = await activateRecommendation(index);
    res.json({
      ok: true,
      task: { id: rec.taskId, url: rec.taskUrl, subject: rec.title },
      recommendation: rec,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/coach/recommendations/:index/suppress", (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const reason = req.body?.reason ? String(req.body.reason) : undefined;
    const result = suppressRecommendation(index, reason);
    res.json({ ok: true, ...result, remaining: getSalesRecommendations() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/coach/suppressions", (_req, res) => {
  res.json({ suppressions: listSalesCoachSuppressions() });
});

app.delete("/api/coach/suppressions/:contactId", (req, res) => {
  const removed = clearSuppressedSalesCoachContact(req.params.contactId);
  res.json({ ok: removed });
});

app.get("/api/coach/audit", (req, res) => {
  const limit = parseInt(req.query.limit as string, 10) || 50;
  res.json({ events: getAuditLog(limit) });
});

// ── Auto-Pilot — automatic task creation for new leads ───────────────

app.get("/api/autopilot/status", (_req, res) => {
  res.json(getAutopilotStatus());
});

app.post("/api/autopilot/start", (req, res) => {
  const interval = req.body?.intervalMinutes;
  startAutopilot(interval);
  res.json({ ok: true, ...getAutopilotStatus() });
});

app.post("/api/autopilot/stop", (_req, res) => {
  stopAutopilot();
  res.json({ ok: true, ...getAutopilotStatus() });
});

app.post("/api/autopilot/run", async (_req, res) => {
  try {
    const log = await runAutopilotNow();
    res.json({ ok: true, log });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/autopilot/logs", (req, res) => {
  const limit = parseInt(req.query.limit as string, 10) || 20;
  res.json({ logs: getAutopilotLogs(limit) });
});

app.get("/api/autopilot/tasks", (req, res) => {
  const limit = parseInt(req.query.limit as string, 10) || 50;
  res.json({ tasks: getAutopilotTasks(limit) });
});

// ── HTTP + WebSocket server ──────────────────────────────────────────

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Authenticate WebSocket upgrade requests
server.on("upgrade", (req, socket, head) => {
  const token = getTokenFromUpgrade(req as any);
  if (!isValidToken(token)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", handleConnection);

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║  PZ HubSpot Agent                            ║
  ║  http://localhost:${PORT}                      ║
  ╚══════════════════════════════════════════════╝
  `);

  // Warm-up: pre-load all reports, then generate AI recommendations.
  // Delay startup warm-up slightly so the app becomes interactive before heavy HubSpot traffic begins.
  const startupWarmDelayMs = Math.max(0, parseInt(process.env.REPORT_WARM_START_DELAY_MS ?? "15000", 10));
  setTimeout(() => {
    warmAllReports()
      .then(() => generateRecommendations())
      .catch((err) =>
        console.error("[WARM] Startup warm-up failed:", err),
      );
  }, startupWarmDelayMs);

  // Coach: start hourly sales performance agent schedule
  if (process.env.COACH_ENABLED !== "false") {
    startCoachSchedule();
    console.log("[COACH] Sales Performance Agent enabled — hourly schedule active");
  } else {
    console.log("[COACH] Sales Performance Agent disabled (COACH_ENABLED=false)");
  }

  // Auto-Pilot: automatic task creation for new leads (every 15 min)
  if (process.env.AUTOPILOT_ENABLED !== "false") {
    const interval = parseInt(process.env.AUTOPILOT_INTERVAL_MINUTES ?? "15", 10);
    startAutopilot(interval);
    console.log(`[AUTOPILOT] Enabled — creating tasks for new HOT leads every ${interval} min`);
  } else {
    console.log("[AUTOPILOT] Disabled (AUTOPILOT_ENABLED=false)");
  }

  // Cron: re-warm all reports every 12 hours to keep cache fresh.
  const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
  setInterval(() => {
    console.log("[CRON] 12-hour report refresh starting...");
    clearAllCaches();
    warmAllReports()
      .then(() => generateRecommendations())
      .catch((err) =>
        console.error("[CRON] 12-hour refresh failed:", err),
      );
  }, TWELVE_HOURS_MS);
});
