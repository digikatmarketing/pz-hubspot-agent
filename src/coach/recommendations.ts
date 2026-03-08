/**
 * Sales Coach — Hot Lead Recommendations with one-click task creation.
 *
 * Queries HubSpot for engagement signals (website visits, form submissions,
 * email clicks, activity gaps), feeds enriched contact data to Claude,
 * and returns ranked, actionable recommendations with playbooks and copy.
 *
 * Cached for 30 minutes. Task activation is instant from cache.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  searchObjects,
  getObject,
  getAssociations,
  createObject,
  createAssociation,
} from "../hubspot/client.js";
import { stageName, UI_DOMAIN, HUB_ID } from "../hubspot/types.js";
import type { SearchFilter } from "../hubspot/types.js";

// ── Types ────────────────────────────────────────────────────────────

export interface SalesRecommendation {
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  contactUrl: string;
  dealId: string | null;
  dealName: string | null;
  dealStage: string | null;
  priority: "hot" | "warm" | "follow-up";
  actionType: "CALL" | "EMAIL" | "TODO";
  signal: string;
  title: string;
  playbook: string;
  talkingPoints: string[];
  copyExample: string;
  taskBody: string;
  activated: boolean;
  taskId: string | null;
  taskUrl: string | null;
}

export interface SalesRecommendationsResult {
  recommendations: SalesRecommendation[];
  generatedAt: string;
  contactsAnalysed: number;
  signalsFound: number;
}

// ── Config ───────────────────────────────────────────────────────────

const BEN_OWNER_ID = "161661298";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ── Lazy Anthropic client ────────────────────────────────────────────

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

// ── Cache ────────────────────────────────────────────────────────────

let _cache: SalesRecommendationsResult | null = null;
let _cacheTime = 0;

function isCacheValid(): boolean {
  return _cache !== null && Date.now() - _cacheTime < CACHE_TTL_MS;
}

// ── HubSpot contact properties for hot lead detection ────────────────

const HOT_LEAD_PROPS = [
  "firstname", "lastname", "email", "phone", "mobilephone",
  "hs_analytics_num_page_views", "hs_analytics_num_visits",
  "hs_analytics_last_visit_timestamp", "hs_analytics_last_timestamp",
  "hs_analytics_last_url", "hs_analytics_source",
  "notes_last_contacted", "notes_last_updated",
  "hs_last_sales_activity_timestamp", "pz_engagement_score",
  "num_conversion_events", "recent_conversion_date", "recent_conversion_event_name",
  "hubspotscore", "hs_lead_status", "lifecyclestage",
  "hs_sales_email_last_clicked",
  "createdate", "lastmodifieddate",
];

// ── Data gathering ──────────────────────────────────────────────────

interface EnrichedContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  properties: Record<string, string | null>;
  signals: string[];
  deal: { id: string; name: string | null; stage: string | null } | null;
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

async function gatherHotLeadData(): Promise<EnrichedContact[]> {
  console.log("[SALES COACH] Querying HubSpot for hot lead signals...");

  const sevenDaysAgo = daysAgo(7);
  const threeDaysAgo = daysAgo(3);

  // Run 5 queries in parallel
  const [q1, q2, q3, q4, q5] = await Promise.all([
    // 1. Recent website visitors with multiple page views
    searchObjects("contacts", {
      filterGroups: [{
        filters: [
          { propertyName: "hs_analytics_last_visit_timestamp", operator: "GT", value: sevenDaysAgo },
          { propertyName: "hs_analytics_num_page_views", operator: "GT", value: "2" },
        ] as SearchFilter[],
      }],
      properties: HOT_LEAD_PROPS,
      limit: 20,
      sorts: [{ propertyName: "hs_analytics_last_visit_timestamp", direction: "DESCENDING" }],
    }),

    // 2. Recent form submissions
    searchObjects("contacts", {
      filterGroups: [{
        filters: [
          { propertyName: "recent_conversion_date", operator: "GT", value: sevenDaysAgo },
        ] as SearchFilter[],
      }],
      properties: HOT_LEAD_PROPS,
      limit: 20,
      sorts: [{ propertyName: "recent_conversion_date", direction: "DESCENDING" }],
    }),

    // 3. High engagement score, not recently contacted
    searchObjects("contacts", {
      filterGroups: [
        {
          filters: [
            { propertyName: "pz_engagement_score", operator: "GT", value: "30" },
            { propertyName: "notes_last_contacted", operator: "LT", value: sevenDaysAgo },
          ] as SearchFilter[],
        },
        {
          filters: [
            { propertyName: "pz_engagement_score", operator: "GT", value: "30" },
            { propertyName: "notes_last_contacted", operator: "NOT_HAS_PROPERTY" },
          ] as SearchFilter[],
        },
      ],
      properties: HOT_LEAD_PROPS,
      limit: 20,
      sorts: [{ propertyName: "lastmodifieddate", direction: "DESCENDING" }],
    }),

    // 4. Clicked sales emails recently
    searchObjects("contacts", {
      filterGroups: [{
        filters: [
          { propertyName: "hs_sales_email_last_clicked", operator: "GT", value: sevenDaysAgo },
        ] as SearchFilter[],
      }],
      properties: HOT_LEAD_PROPS,
      limit: 15,
      sorts: [{ propertyName: "hs_sales_email_last_clicked", direction: "DESCENDING" }],
    }),

    // 5. New contacts with no sales activity (speed-to-lead)
    searchObjects("contacts", {
      filterGroups: [{
        filters: [
          { propertyName: "createdate", operator: "GT", value: threeDaysAgo },
          { propertyName: "notes_last_contacted", operator: "NOT_HAS_PROPERTY" },
        ] as SearchFilter[],
      }],
      properties: HOT_LEAD_PROPS,
      limit: 15,
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
    }),
  ]);

  console.log(
    `[SALES COACH] Query results: visitors=${q1.total}, forms=${q2.total}, ` +
    `engaged=${q3.total}, emailClicks=${q4.total}, newLeads=${q5.total}`,
  );

  // Deduplicate by contact ID
  const contactMap = new Map<string, EnrichedContact>();

  function addContacts(
    results: typeof q1.results,
    signalLabel: string,
  ) {
    for (const c of results) {
      const name = `${c.properties.firstname ?? ""} ${c.properties.lastname ?? ""}`.trim();
      if (!name || name === "(no name)") continue; // Skip unnamed contacts

      const existing = contactMap.get(c.id);
      if (existing) {
        existing.signals.push(signalLabel);
      } else {
        contactMap.set(c.id, {
          id: c.id,
          name,
          email: c.properties.email ?? null,
          phone: c.properties.phone ?? c.properties.mobilephone ?? null,
          properties: c.properties,
          signals: [signalLabel],
          deal: null,
        });
      }
    }
  }

  addContacts(q1.results, "recent_website_visitor");
  addContacts(q2.results, "recent_form_submission");
  addContacts(q3.results, "high_engagement_not_contacted");
  addContacts(q4.results, "clicked_sales_email");
  addContacts(q5.results, "new_lead_no_contact");

  // Enrich with deal data (top 30 contacts only to limit API calls)
  const contacts = Array.from(contactMap.values()).slice(0, 30);

  await Promise.all(
    contacts.map(async (contact) => {
      try {
        const assocRes = await getAssociations("contacts", contact.id, "deals", 5);
        const dealIds = assocRes.results?.[0]?.to?.map((t) => t.toObjectId) ?? [];

        if (dealIds.length > 0) {
          const deal = await getObject("deals", dealIds[0], [
            "dealname", "dealstage", "amount", "pipeline",
          ]);
          contact.deal = {
            id: deal.id,
            name: deal.properties.dealname ?? null,
            stage: stageName(deal.properties.dealstage ?? ""),
          };
        }
      } catch {
        // Ignore association errors — contact data is still valuable
      }
    }),
  );

  console.log(`[SALES COACH] ${contacts.length} unique contacts enriched with deal data`);
  return contacts;
}

// ── Claude analysis prompt ──────────────────────────────────────────

const ANALYSIS_SYSTEM = `You are the Sales Coach for Primal Zone — an Australian TRT (Testosterone Replacement Therapy) telehealth clinic. Your job is to analyse contact engagement data and produce specific, actionable sales recommendations for Ben (the sales rep).

## Primal Zone Context
- Men aged 30-55 who have been thinking about TRT for a while before enquiring
- Once they reach out, the decision window is SHORT — speed to lead wins
- Common objections: cost concerns, partner hesitation, fear of needles, "want to think about it"
- Pipeline: Lead → Meeting Booked → Application → Submission Check → Consultant → Doctor Review → Approved
- A TRT patient on ongoing treatment = significant recurring revenue

## Ben's Style
- Direct, no-nonsense, warm but professional
- Australian casual tone — "mate", "no worries", "let's get you sorted"
- Phone-first approach — calls convert better than emails for TRT

## Your Task
Analyse the contact data and produce 5-7 ranked sales recommendations (maximum 7). Each recommendation must be specific to the actual contact and their engagement signals. Keep responses concise to stay within JSON limits.

For each recommendation, provide ALL of the following fields as a JSON object:

- contactId: string (the HubSpot contact ID — MUST match one from the data)
- priority: "hot" | "warm" | "follow-up"
- actionType: "CALL" | "EMAIL" | "TODO"
- signal: 1-2 sentence explanation of WHY this lead is hot right now (cite specific data)
- title: short task subject line for Ben (e.g. "Call John Smith — TRT enquiry, visited pricing 3x")
- playbook: 3-4 sentences of specific coaching for Ben on how to approach this contact
- talkingPoints: array of 3-5 bullet points Ben can reference during the call/email
- copyExample: a ready-to-use SMS/email or call opening script (conversational, Australian tone)
- taskBody: compact task body (3-5 lines max) with key action + talking points + copy for HubSpot

## Ranking Priority
- HOT: Recent website visit + form submission, OR new lead <24h with no contact, OR clicked email + visited site
- WARM: Recent website visits OR form submission OR email click (single signal), OR engaged but not contacted in 7+ days
- FOLLOW-UP: Stale contact with historical engagement, or re-engaged after quiet period

## Rules
- Only recommend contacts from the provided data — never invent contacts
- Be specific — reference actual page views, visit times, form names
- Write copy in Ben's voice — casual Australian, direct, warm
- For calls: write an opening line, not a full script
- For emails/SMS: write the full message ready to send
- The taskBody should be comprehensive — Ben should be able to open the task and know exactly what to do

Respond with ONLY a JSON array of recommendation objects. No markdown, no commentary, just valid JSON.`;

// ── Core generation logic ───────────────────────────────────────────

export async function generateSalesRecommendations(): Promise<SalesRecommendationsResult> {
  console.log("[SALES COACH] Generating hot lead recommendations...");
  const startTime = Date.now();

  const contacts = await gatherHotLeadData();

  if (contacts.length === 0) {
    console.log("[SALES COACH] No contacts with engagement signals found");
    const result: SalesRecommendationsResult = {
      recommendations: [],
      generatedAt: new Date().toISOString(),
      contactsAnalysed: 0,
      signalsFound: 0,
    };
    _cache = result;
    _cacheTime = Date.now();
    return result;
  }

  // Build contact data payload for Claude
  const contactPayload = contacts.map((c) => ({
    contactId: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    signals: c.signals,
    deal: c.deal,
    pageViews: c.properties.hs_analytics_num_page_views,
    sessions: c.properties.hs_analytics_num_visits,
    lastVisit: c.properties.hs_analytics_last_visit_timestamp,
    lastSeen: c.properties.hs_analytics_last_timestamp,
    lastPageSeen: c.properties.hs_analytics_last_url,
    trafficSource: c.properties.hs_analytics_source,
    lastContacted: c.properties.notes_last_contacted,
    lastActivity: c.properties.notes_last_updated,
    engagementScore: c.properties.pz_engagement_score,
    formSubmissions: c.properties.num_conversion_events,
    recentConversionDate: c.properties.recent_conversion_date,
    recentConversion: c.properties.recent_conversion_event_name,
    hubspotScore: c.properties.hubspotscore,
    leadStatus: c.properties.hs_lead_status,
    lifecycleStage: c.properties.lifecyclestage,
    emailLastClicked: c.properties.hs_sales_email_last_clicked,
    created: c.properties.createdate,
  }));

  const totalSignals = contacts.reduce((sum, c) => sum + c.signals.length, 0);

  const userMessage = `Here are ${contacts.length} contacts with recent engagement signals (${totalSignals} total signals detected).\n\nCurrent time: ${new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "full", timeStyle: "long" })}\n\nContact data:\n${JSON.stringify(contactPayload, null, 2)}\n\nAnalyse these contacts and produce 5-10 ranked sales recommendations as a JSON array.`;

  try {
    const response = await getClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 16384,
      system: ANALYSIS_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Parse JSON — strip markdown fences if present
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    // Handle truncated JSON — try to recover partial array
    let rawRecs: any[];
    try {
      rawRecs = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.warn("[SALES COACH] JSON parse failed, attempting truncation recovery...");
      // Find last complete object in array (last "},")
      const lastComplete = jsonStr.lastIndexOf("},");
      if (lastComplete > 0) {
        const recovered = jsonStr.substring(0, lastComplete + 1) + "]";
        rawRecs = JSON.parse(recovered);
        console.log(`[SALES COACH] Recovered ${rawRecs.length} recommendations from truncated response`);
      } else {
        throw parseErr;
      }
    }

    // Enrich recommendations with contact/deal metadata from our gathered data
    const recommendations: SalesRecommendation[] = rawRecs.map((rec) => {
      const contact = contacts.find((c) => c.id === rec.contactId);
      return {
        ...rec,
        contactName: contact?.name ?? "Unknown",
        contactEmail: contact?.email ?? null,
        contactPhone: contact?.phone ?? null,
        contactUrl: `https://${UI_DOMAIN}/contacts/${HUB_ID}/contact/${rec.contactId}`,
        dealId: contact?.deal?.id ?? null,
        dealName: contact?.deal?.name ?? null,
        dealStage: contact?.deal?.stage ?? null,
        activated: false,
        taskId: null,
        taskUrl: null,
      };
    });

    const result: SalesRecommendationsResult = {
      recommendations,
      generatedAt: new Date().toISOString(),
      contactsAnalysed: contacts.length,
      signalsFound: totalSignals,
    };

    _cache = result;
    _cacheTime = Date.now();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[SALES COACH] Generated ${recommendations.length} recommendations ` +
      `from ${contacts.length} contacts in ${elapsed}s`,
    );

    return result;
  } catch (err: any) {
    console.error("[SALES COACH] Generation failed:", err?.message ?? err);
    throw err;
  }
}

// ── Read cached recommendations ─────────────────────────────────────

export function getSalesRecommendations(): SalesRecommendationsResult | null {
  return _cache;
}

export function isSalesCoachCacheValid(): boolean {
  return isCacheValid();
}

// ── Activate a recommendation (create HubSpot task) ─────────────────

export async function activateRecommendation(
  index: number,
): Promise<SalesRecommendation> {
  if (!_cache) {
    throw new Error("No recommendations cached — generate first");
  }
  if (index < 0 || index >= _cache.recommendations.length) {
    throw new Error(`Invalid recommendation index: ${index}`);
  }

  const rec = _cache.recommendations[index];

  if (rec.activated) {
    return rec; // Already activated — return existing task info
  }

  // Build due date: tomorrow 9am AEST
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 1);
  dueDate.setHours(22, 0, 0, 0); // 22:00 UTC ≈ 9:00 AEDT next day

  const priorityMap: Record<string, string> = {
    hot: "HIGH",
    warm: "MEDIUM",
    "follow-up": "LOW",
  };

  // Create the task
  const task = await createObject("tasks", {
    hs_task_subject: rec.title,
    hs_task_body: rec.taskBody,
    hubspot_owner_id: BEN_OWNER_ID,
    hs_task_priority: priorityMap[rec.priority] ?? "MEDIUM",
    hs_task_type: rec.actionType,
    hs_task_status: "NOT_STARTED",
    hs_timestamp: dueDate.toISOString(),
  });

  // Associate with contact
  try {
    await createAssociation(
      "tasks", task.id,
      "contacts", rec.contactId,
      "HUBSPOT_DEFINED", 204,
    );
  } catch (err: any) {
    console.warn(`[SALES COACH] Failed to associate task with contact: ${err.message}`);
  }

  // Associate with deal if available
  if (rec.dealId) {
    try {
      await createAssociation(
        "tasks", task.id,
        "deals", rec.dealId,
        "HUBSPOT_DEFINED", 216,
      );
    } catch (err: any) {
      console.warn(`[SALES COACH] Failed to associate task with deal: ${err.message}`);
    }
  }

  // Update cache
  rec.activated = true;
  rec.taskId = task.id;
  rec.taskUrl = `https://${UI_DOMAIN}/contacts/${HUB_ID}/task/${task.id}`;

  console.log(
    `[SALES COACH] Task created for "${rec.contactName}" — ` +
    `ID: ${task.id}, type: ${rec.actionType}, priority: ${rec.priority}`,
  );

  return rec;
}
