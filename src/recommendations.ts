/**
 * AI Recommended Actions — analyses cached report data via a single Claude call
 * and produces 5–8 prioritised business recommendations for the PZ telehealth operation.
 *
 * Cached for 12 hours (same TTL as reports). Regenerated on the 12-hour cron cycle.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getCachedReportData } from "./reports/index.js";
import { getSummaryKPIs } from "./reports/summary.js";
import { getCached, setCache } from "./reports/cache.js";
import type { ReportResult } from "./reports/index.js";

// ── Types ────────────────────────────────────────────────────────────

export interface Recommendation {
  id: string;
  priority: "critical" | "high" | "medium" | "low";
  category: "revenue" | "retention" | "operations" | "marketing" | "prescriptions";
  title: string;
  problem: string;
  action: string;
  impact: string;
  supportingData: string[];
}

export interface RecommendationsResult {
  recommendations: Recommendation[];
  generatedAt: string;
  dataRange: string;
  reportCount: number;
}

// ── Lazy Anthropic client (same pattern as agent.ts) ──────────────────

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic();
  }
  return _client;
}

const CACHE_KEY = "recommendations";

// ── Analysis prompt ──────────────────────────────────────────────────

const ANALYSIS_SYSTEM = `You are the Primal Zone business analyst. Primal Zone is an Australian telehealth + compounding pharmacy platform specialising in TRT (testosterone replacement therapy), weight loss, performance, and injury repair.

Business model:
- Patients apply via a deal pipeline (Lead → Meeting Booked → Application → Submission Check → Consultant → Doctor Review → Approved → Cancelled)
- Approved patients purchase via Shopify (shop.primalzone.com)
- Revenue comes from Shopify ORDERS, not deals
- Prescriptions are managed as custom objects with statuses: ACTIVE, PARTIALLY_DISPENSED, EXPIRING_SOON, FULLY_DISPENSED, EXPIRED, CANCELLED
- Repeat prescriptions drive retention and recurring revenue
- Shipping via Australia Post (StarTrack)

You will receive cached report data covering multiple time ranges. Analyse it and produce 5–8 prioritised, actionable business recommendations.

Each recommendation MUST include:
- id: short kebab-case identifier (e.g. "reduce-pipeline-bottleneck")
- priority: "critical" | "high" | "medium" | "low"
- category: "revenue" | "retention" | "operations" | "marketing" | "prescriptions"
- title: concise headline (max 10 words)
- problem: what the data shows (2-3 sentences, cite specific numbers)
- action: what to do about it (2-3 sentences, be specific and practical)
- impact: expected outcome if actioned (1 sentence)
- supportingData: array of 2-4 short metric strings that back this up (e.g. "Revenue: $1.2M LTM", "Conversion: 34%")

Sort recommendations by priority (critical first). Be direct and commercially minded. Focus on revenue growth, patient retention, operational efficiency, marketing optimisation, and prescription management.

Respond with ONLY a JSON array of recommendation objects. No markdown, no commentary, just the JSON array.`;

// ── Core logic ──────────────────────────────────────────────────────

/**
 * Condense report data for the prompt — strip metadata, keep only what matters.
 */
function condenseReports(
  reports: Record<string, ReportResult>,
): Array<{ reportId: string; title: string; data: ReportResult["data"] }> {
  return Object.entries(reports).map(([_key, report]) => ({
    reportId: report.reportId,
    title: report.title,
    data: report.data,
  }));
}

/**
 * Generate AI recommendations from cached report data.
 * Makes a single Claude API call (~$0.03).
 */
export async function generateRecommendations(): Promise<RecommendationsResult | null> {
  console.log("[ACTIONS] Generating AI recommendations...");

  // Gather data from multiple date ranges for trend context
  const ltmData = getCachedReportData(undefined, "ltm");
  const last30Data = getCachedReportData(undefined, "last_30");
  const mtdData = getCachedReportData(undefined, "mtd");

  const totalReports =
    Object.keys(ltmData).length +
    Object.keys(last30Data).length +
    Object.keys(mtdData).length;

  if (totalReports === 0) {
    console.log("[ACTIONS] No cached report data available yet. Skipping.");
    return null;
  }

  // Get summary KPIs (all-time totals)
  let summaryKPIs: unknown = null;
  try {
    summaryKPIs = await getSummaryKPIs();
  } catch (err: any) {
    console.error("[ACTIONS] Failed to get summary KPIs:", err?.message);
  }

  // Build condensed data payload
  const payload = {
    summaryKPIs,
    last12Months: condenseReports(ltmData),
    last30Days: condenseReports(last30Data),
    monthToDate: condenseReports(mtdData),
  };

  const userMessage = `Here is the current Primal Zone business data across multiple time ranges:\n\n${JSON.stringify(payload, null, 2)}\n\nAnalyse this data and provide 5–8 prioritised business recommendations as a JSON array.`;

  try {
    const response = await getClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: ANALYSIS_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });

    // Extract text from response
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Parse JSON — strip markdown fences if present
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const recommendations: Recommendation[] = JSON.parse(jsonStr);

    const result: RecommendationsResult = {
      recommendations,
      generatedAt: new Date().toISOString(),
      dataRange: "ltm + last_30 + mtd",
      reportCount: totalReports,
    };

    // Cache for 12 hours
    setCache(CACHE_KEY, result);

    console.log(
      `[ACTIONS] Generated ${recommendations.length} recommendations from ${totalReports} cached reports.`,
    );

    return result;
  } catch (err: any) {
    console.error("[ACTIONS] Failed to generate recommendations:", err?.message ?? err);
    return null;
  }
}

/**
 * Read cached recommendations (sync — no API calls).
 */
export function getRecommendations(): RecommendationsResult | null {
  return getCached<RecommendationsResult>(CACHE_KEY);
}
