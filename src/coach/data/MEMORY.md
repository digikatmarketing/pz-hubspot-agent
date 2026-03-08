# Coach Memory — Active Items

> **Last updated**: Monday, 9 March 2026 at 7:26 AM AEDT
> **Last run type**: Morning Briefing (Run 006)

---

## Pipeline Snapshot

_Captured: Monday 9 March 2026, 07:26 AEDT_

| Stage | Count | Δ Since Last Run | SLA | Stale Count (≥SLA) |
|---|---|---|---|---|
| Lead | 0 | **-4,377 ⚠️ ALERT-009** | 1 hour | 0 |
| Meeting Booked | 238 | 0 ✅ | 2 days | 238 (bulk import cohort) |
| Application | 89 | 0 ✅ | 3 days | 82 confirmed stale (bulk) |
| Submission Check | 90 | 0 ✅ | 2 days | 74 confirmed stale (bulk) |
| Consultant | 0 | 0 | 3 days | 0 |
| Doctor Review | 74 | 0 ✅ | 3 days | 66 confirmed stale (bulk) |
| Approved by Doctor | 162 | 0 | — | — |
| Cancelled | 11 | 0 | — | — |
| **TOTAL ACTIVE** | **664** | **-4,377 ⚠️** | | |

> ⚠️ **ALERT-009 RAISED**: Lead stage dropped from 4,377 → 0 between Run 005 (06:26) and Run 006 (07:26). Total deal count dropped from 5,041 → 664 — exactly matching the Lead count. Strong indicator the bulk import Lead cohort was deleted or archived overnight. This may be intentional (Primal Zone cleanup) or accidental. Requires urgent confirmation. No new Lead SLA tasks to fire until verified.

> ✅ **All stale deal samples remain bulk import cohort** — Meeting Booked, Application, Submission Check, Doctor Review stages unchanged. SLA alerting correctly suspended for bulk records.

> ✅ **No new contacts** in last 70 minutes. No overnight leads requiring immediate action.

---

## Bulk Import Deal Cohort Summary

_Confirmed bulk import records — DO NOT generate SLA tasks against these_

| Stage | Confirmed Bulk Count | Deal Name Pattern | Created (UTC) |
|---|---|---|---|
| Lead | ~~4,377~~ → **0** ⚠️ DELETED/MOVED? | "Lead — [Name]" | 2 Mar, 21:09 UTC |
| Meeting Booked | 238 | "Lead — [Name]" | 2 Mar, 21:09 UTC |
| Application | 82 | "MEN'S FULL HORMONE RESET", "WEIGHT LOSS, PERFORMANCE & INJURY REPAIR" | 2 Mar, 18:23 UTC |
| Submission Check | 74 | "MEN'S FULL HORMONE RESET" | 2 Mar, 18:23 UTC |
| Doctor Review | 66 | "MEN'S FULL HORMONE RESET" | 2 Mar, 18:23 UTC |
| **TOTAL REMAINING** | **~460** | | |

> The 4,377 Lead-stage bulk records are no longer appearing in the pipeline count. This may reflect a deletion, archiving, or pipeline reassignment overnight. Ben to confirm with Primal Zone.

---

## Active Alerts

### 🔴 ALERT-009 — Lead Stage Bulk Records Vanished (NEW — Urgent Verification Required)
- **Raised**: 9 March 2026, 07:26 AEDT
- **Type**: Pipeline Integrity
- **Detail**: Lead stage count dropped from 4,377 → 0 between 06:26 and 07:26 AEDT. Total pipeline count dropped from 5,041 → 664 — a reduction of exactly 4,377, matching the previous Lead count precisely. This strongly suggests the bulk import Lead cohort ("Lead — [Name]" records) was deleted or archived overnight/early morning. No new contacts created to replace them. No other stage has changed.
- **Possible explanations**:
  1. Primal Zone team deleted/archived bulk import leads overnight ✅ (best case — intentional cleanup)
  2. A HubSpot pipeline filter or view change is hiding them (less likely — count_deals_by_stage is comprehensive)
  3. Accidental mass deletion ⚠️ (needs urgent verification)
- **Action Required**: Ben to confirm with Primal Zone team ASAP — was this a deliberate action? If accidental, escalate to HubSpot admin immediately (records may be recoverable from recycle bin within 90 days).
- **HubSpot Task**: To be created — "URGENT: Confirm Lead stage deletion — 4,377 records gone since 6 AM"

### 🔴 ALERT-001 — Bulk Data Anomaly (PARTIALLY RESOLVED — Lead Stage Cleared, Others Remain)
- **Raised**: 8 March 2026, 14:51 AEDT
- **Last confirmed**: 9 March 2026, 07:26 AEDT — **LEAD STAGE NOW 0. OTHER STAGES UNCHANGED.**
- **Type**: Pipeline Integrity
- **Detail**: Original ~5,000 bulk import deals. Lead cohort (4,377) now gone — likely deleted overnight. Meeting Booked (238), Application (82), Submission Check (74), Doctor Review (66) cohorts remain.
- **HubSpot Task**: ID 357215817444 — "MONDAY AM PRIORITY — Investigate bulk import + suspend SLA alerting for batch cohort" — **NOT_STARTED** — still relevant, now includes Lead deletion investigation.
- **Status**: Elevated — Lead deletion needs explanation before task can be closed.

### 🟡 ALERT-002 — Doctor Review Backlog (At Risk — Task Open)
- **Raised**: 8 March 2026, 14:51 AEDT
- **Last confirmed**: 9 March 2026, 07:26 AEDT — **66 STALE. NO CHANGE. TASK OPEN.**
- **Type**: Stage SLA Breach
- **Detail**: 66 of 74 Doctor Review deals are 6+ days old (SLA = 3 days). All sampled = bulk import cohort. Any genuine post-consult patients waiting for doctor sign-off are at high churn risk.
- **HubSpot Task**: ID 356678665923 — "Doctor Review audit — identify genuine patients vs. bulk import records" — **NOT_STARTED**
- **Action Required**: Ben to audit Doctor Review stage today, identify real patients, chase doctor sign-off.

### 🔴 ALERT-003 — Monday Meeting Surge + Unlinked Meetings (ACTIVE — Meetings START at 1 PM)
- **Raised**: 8 March 2026, 14:51 AEDT
- **Last confirmed**: 9 March 2026, 07:26 AEDT — **6 MEETINGS TODAY. ALL UNLINKED. CONFIRMED VIA API. TASK OPEN.**
- **Type**: Scheduling / Pipeline Risk
- **Detail**:
  - **Monday 9 March** — 6 confirmed meetings (ALL unlinked to contacts — confirmed via get_meetings_today, associatedContacts: [] for ALL 6):
    | Time (AEDT) | Meeting ID | Title | Contact | Status |
    |---|---|---|---|---|
    | 1:00 PM | 355652499171 | 15 Min Discovery Call | Not linked ⚠️ | SCHEDULED |
    | 1:15 PM | 356464643796 | 15 Min Discovery Call | Not linked ⚠️ | SCHEDULED |
    | 1:30 PM | 356564025034 | 15 Min Discovery Call | Not linked ⚠️ | SCHEDULED |
    | 3:00 PM | 356575393507 | Aaron Peterson & Primal Zone | Not linked in HubSpot ⚠️ (ID known: 338950159083) | SCHEDULED |
    | 4:30 PM | 357166286550 | 15 Min Discovery Call | Not linked ⚠️ | SCHEDULED |
    | 6:45 PM | 356812426957 | 15 Min Discovery Call | Not linked ⚠️ | SCHEDULED |
  - **Tuesday 10 March** — 3 meetings:
    | Time (AEDT) | Meeting ID | Title | Contact | Status |
    |---|---|---|---|---|
    | 1:00 PM | 356549499578 | 15 Min Discovery Call | Not linked | SCHEDULED |
    | 4:30 PM | 356575512259 | Michael Marks & Primal Zone | Not linked (ID known: 402192076527) | SCHEDULED |
    | 6:00 PM | 356674535155 | 15 Min Discovery Call | Not linked | RESCHEDULED |
  - **Thursday 12 March** — 1 meeting:
    | Time (AEDT) | Meeting ID | Title | Contact | Status |
    |---|---|---|---|---|
    | 4:30 PM | 356622308066 | 15 Min Discovery Call | Not linked | SCHEDULED |
- **Contact intelligence**:
  - **Aaron Peterson** (ID: 338950159083): Existing customer since Dec 2025, age 35, Silkstone QLD. Email: ajp_44@hotmail.com | Phone: +61478178393. No active deals. Prep task active.
  - **Michael Marks** (ID: 402192076527): Existing customer since Jan 2026, age 66, Mildura VIC. Email: mmmle@mmmle.au | Phone: +61427303432. No associated deals. Data quality issue (state = "State"). Prep task active.
- **HubSpot Tasks Open**:
  - ID 357215786730 — Aaron Peterson meeting prep (due Mon 11 AM) — **NOT_STARTED ⏰ DUE IN ~3.5 HRS**
  - ID 356678664939 — Michael Marks meeting prep (due Mon 10 PM) — **NOT_STARTED**
  - ID 357225062091 — Link contacts to today's 6 meetings (due Mon 11 AM) — **NOT_STARTED ⚠️ CRITICAL — meetings start 1 PM, <6 hrs away**

### 🔴 ALERT-004 — Activity Levels Critical (Monday — Ben Not Yet Active)
- **Raised**: 8 March 2026, 14:51 AEDT
- **Last confirmed**: 9 March 2026, 07:26 AEDT — **ZERO ACTIVITY. PRE-WORK-DAY EXPECTED.**
- **Type**: Activity Below Target
- **Detail**:
  - Calls Sunday: 0. Emails Sunday: 0.
  - Since Sunday 00:00 UTC: 0 calls, 0 emails, 0 notes. 3 scheduled meetings (future).
  - Week total (Mon 2 – Sun 8 Mar): 3 calls, 0 emails.
  - Targets: 15 calls/day, 10 emails/day.
  - Zero emails across 7 days remains the single most critical structural gap.
  - 3 tasks formally overdue (Jono, Trent, Shannon — Saturday leads, now 2 days cold).
- **HubSpot Task**: ID 356808220371 — "ACTIVITY RESET — Hit 15 calls + 10 emails today" — **NOT_STARTED**
- **Monitor**: Activity expected from ~8-9 AM AEDT. Next check at next run.

### 🟡 ALERT-005 — Submission Check Stale Count (Stable)
- **Raised**: 8 March 2026, 16:28 AEDT
- **Last confirmed**: 9 March 2026, 07:26 AEDT — **STABLE AT 74. NO CHANGE.**
- **Type**: Stage SLA Variance / Monitor
- **Detail**: Stale count stable at 74 across 6 consecutive runs. All sampled = bulk import cohort.
- **Action Required**: Include in bulk import resolution sweep.

### 🟡 ALERT-006 — Total Deal Count Anomaly (SUPERSEDED BY ALERT-009)
- **Raised**: 9 March 2026, 00:06 AEDT
- **Last confirmed**: 9 March 2026, 07:26 AEDT — **COUNT NOW 664 (was 5,041). SEE ALERT-009.**
- **Type**: Pipeline Integrity / Superseded
- **Detail**: The +172 unexplained jump from Run 003 is now irrelevant — the total count has dropped dramatically due to Lead stage bulk record removal. ALERT-009 supersedes this.
- **Status**: Monitoring subsumed into ALERT-009.

### 🔴 ALERT-007 — 3 Formally Overdue Tasks (Jono, Trent, Shannon — 2 Days Cold)
- **Raised**: 9 March 2026, 00:06 AEDT
- **Last confirmed**: 9 March 2026, 07:26 AEDT — **3 TASKS CONFIRMED OVERDUE. 4 MORE DUE TODAY. 0 COMPLETED.**
- **Type**: Task Hygiene / Lead Risk
- **Detail**:
  - **3 OVERDUE** (due Saturday 8 March — now 2 days cold):
    | Task ID | Subject | Due | Priority | Status |
    |---|---|---|---|---|
    | 357086545636 | Call Jono — brand new lead, just submitted health quiz | Sat 8 Mar | HIGH | NOT_STARTED 🔴 |
    | 357092026066 | Call Trent — new lead, quiz resubmitted, never contacted | Sat 8 Mar | HIGH | NOT_STARTED 🔴 |
    | 357091993303 | Call Shannon — re-engaged today after going quiet | Sat 8 Mar | HIGH | NOT_STARTED 🔴 |
  - **4 DUE TODAY** (Mon 9 Mar):
    | Task ID | Subject | Due | Priority | Status |
    |---|---|---|---|---|
    | 356674805438 | Call Joshua Henry — quiz + blood test page visit | Mon 9 Mar | HIGH | NOT_STARTED ⚠️ |
    | 356674821831 | Email Trent Chapman — new lead, no phone | Mon 9 Mar | HIGH | NOT_STARTED ⚠️ |
    | 357012917963 | Email Grant Smith — new lead, business owner | Mon 9 Mar | HIGH | NOT_STARTED ⚠️ |
    | 357014764233 | Email Ladislas Loudoux — new lead, no phone | Mon 9 Mar | HIGH | NOT_STARTED ⚠️ |
- **Action Required**: Ben to clear ALL 7 first thing this morning. Jono, Trent, Shannon are highest risk.

### 🟡 ALERT-008 — Michael Marks Deal Association Error (Monitor)
- **Raised**: 9 March 2026, 03:23 AEDT
- **Last confirmed**: 9 March 2026, 07:26 AEDT — **NO CHANGE. LOW PRIORITY.**
- **Type**: Data Quality / Minor
- **Detail**: Michael Marks (ID: 402192076527) has no associated deals. Existing customer since Jan 2026 with patient ID but no pipeline deal. State field reads "State" instead of "VIC".
- **Action Required**: Ben to review after Tuesday meeting, create deal or note context. Fix state field.

---

## Monday Morning Priority Queue

> Active as of 07:26 AEDT Monday 9 March — Morning Briefing Run 006

1. **[CRITICAL — ALERT-009 — NEW TASK]** Confirm Lead stage deletion with Primal Zone — 4,377 records gone since 6 AM. Accidental? Intentional? Time-sensitive if accidental (HubSpot recycle bin).
2. **[CRITICAL — Task 357215817444]** Investigate remaining bulk import cohorts — now more urgent given Lead stage wipe.
3. **[CRITICAL — ALERT-007]** Call Jono, Trent, Shannon FIRST THING — 2 days cold. Window is closing.
4. **[HIGH — Task 357225062091]** Link contacts to all 6 today's meetings — **must be done before 1:00 PM** (< 6 hours).
5. **[HIGH — Task 357215786730]** Prep Aaron Peterson 3:00 PM — existing customer.
6. **[HIGH — 4 tasks due today]** Call Joshua Henry + Email Trent Chapman, Grant Smith, Ladislas Loudoux.
7. **[HIGH — Task 356678665923]** Doctor Review audit — identify genuine post-consult patients.
8. **[HIGH — Task 356808220371]** Activity reset — 15 calls + 10 emails. Zero emails last week.
9. **[HIGH — Task 356678664939]** Prep Michael Marks Tuesday 4:30 PM.
10. **[MEDIUM]** Submission Check sweep — 74 stale deals (after bulk import confirmed).
11. **[MEDIUM]** Application follow-up sweep — 82 stale deals (after bulk import confirmed).
12. **[LOW]** Cancelled deals reactivation review — 11 records.
13. **[LOW]** Fix Michael Marks contact record — state "State" → "VIC", create deal if appropriate.

---

## Upcoming Meetings

### Monday 9 March 2026 — 6 Meetings (TODAY) ⚠️ ALL UNLINKED
| Time (AEDT) | Meeting ID | Title | Contact | Status |
|---|---|---|---|---|
| 1:00 PM | 355652499171 | 15 Min Discovery Call | Not linked ⚠️ | SCHEDULED |
| 1:15 PM | 356464643796 | 15 Min Discovery Call | Not linked ⚠️ | SCHEDULED |
| 1:30 PM | 356564025034 | 15 Min Discovery Call | Not linked ⚠️ | SCHEDULED |
| 3:00 PM | 356575393507 | Aaron Peterson & Primal Zone | Known ID 338950159083 — not linked in HubSpot ⚠️ | SCHEDULED |
| 4:30 PM | 357166286550 | 15 Min Discovery Call | Not linked ⚠️ | SCHEDULED |
| 6:45 PM | 356812426957 | 15 Min Discovery Call | Not linked ⚠️ | SCHEDULED |

### Tuesday 10 March 2026 — 3 Meetings
| Time (AEDT) | Meeting ID | Title | Contact | Status |
|---|---|---|---|---|
| 1:00 PM | 356549499578 | 15 Min Discovery Call | Not linked | SCHEDULED |
| 4:30 PM | 356575512259 | Michael Marks & Primal Zone | Known ID 402192076527 — not linked in HubSpot | SCHEDULED |
| 6:00 PM | 356674535155 | 15 Min Discovery Call | Not linked | RESCHEDULED |

### Thursday 12 March 2026 — 1 Meeting
| Time (AEDT) | Meeting ID | Title | Contact | Status |
|---|---|---|---|---|
| 4:30 PM | 356622308066 | 15 Min Discovery Call | Not linked | SCHEDULED |

---

## Open Tasks (HubSpot)

_As of 07:26 AEDT Monday 9 March 2026 — 13 existing + 1 to be created = 14 total, 0 completed_

| Task ID | Subject | Due | Priority | Status | Age |
|---|---|---|---|---|---|
| 357086545636 | Call Jono — brand new lead, just submitted health quiz | Sat 8 Mar | HIGH | NOT_STARTED | 🔴 Overdue 2 days |
| 357092026066 | Call Trent — new lead, quiz resubmitted, never contacted | Sat 8 Mar | HIGH | NOT_STARTED | 🔴 Overdue 2 days |
| 357091993303 | Call Shannon — re-engaged today after going quiet | Sat 8 Mar | HIGH | NOT_STARTED | 🔴 Overdue 2 days |
| 356674805438 | Call Joshua Henry — quiz + blood test page visit | Mon 9 Mar | HIGH | NOT_STARTED | ⚠️ Due today |
| 356674821831 | Email Trent Chapman — new lead, no phone | Mon 9 Mar | HIGH | NOT_STARTED | ⚠️ Due today |
| 357012917963 | Email Grant Smith — new lead, business owner | Mon 9 Mar | HIGH | NOT_STARTED | ⚠️ Due today |
| 357014764233 | Email Ladislas Loudoux — new lead, no phone | Mon 9 Mar | HIGH | NOT_STARTED | ⚠️ Due today |
| 357215817444 | MONDAY AM — Investigate bulk import | Mon 9 Mar | HIGH | NOT_STARTED | ⚠️ Due today |
| 357215786730 | PREP — Aaron Peterson 3 PM today | Mon 9 Mar 11am | HIGH | NOT_STARTED | ⏰ Due 11 AM |
| 357225062091 | Link contacts to today's 6 meetings | Mon 9 Mar 11am | HIGH | NOT_STARTED | ⏰ Due 11 AM |
| 356678664939 | PREP — Michael Marks Tue 4:30 PM | Mon 9 Mar 10pm | HIGH | NOT_STARTED | 🆕 |
| 356678665923 | Doctor Review audit | Mon 9 Mar 1pm UTC | HIGH | NOT_STARTED | 🆕 |
| 356808220371 | ACTIVITY RESET — Hit 15 calls + 10 emails today | Mon 9 Mar 10pm | HIGH | NOT_STARTED | 🆕 |
| [NEW — ALERT-009] | URGENT: Confirm Lead stage deletion — 4,377 records gone | Mon 9 Mar ASAP | HIGH | NOT_STARTED | 🆕 NEW |

---

## Contact Intelligence

### Aaron Peterson (Meeting today 3:00 PM)
- **HubSpot ID**: 338950159083
- **Email**: ajp_44@hotmail.com
- **Phone**: +61478178393
- **DOB**: 6 January 1991 (age 35)
- **Address**: 7 Church St, Silkstone QLD 4304
- **Lifecycle**: CUSTOMER (since December 2025)
- **Active deals**: None found
- **Patient ID**: 376bc41d-f687-45e4-a3ad-30e84ed04eae
- **Note**: HubSpot API confirms meeting is NOT linked to contact (associatedContacts: []). Must be linked before 1 PM today.

### Michael Marks (Meeting Tuesday 4:30 PM)
- **HubSpot ID**: 402192076527
- **Email**: mmmle@mmmle.au
- **Phone**: +61427303432
- **DOB**: 11 February 1960 (age 66)
- **Address**: 14 Explorer Drive, Mildura VIC 3500
- **Lifecycle**: CUSTOMER (since January 2026)
- **Active deals**: None — confirmed via 2 consecutive lookup attempts.
- **Patient ID**: 9b182ab9-606c-4caf-923e-fd79977ac310
- **Data quality**: State = "State" (should be "VIC")
- **Note**: HubSpot API confirms meeting not linked to contact. Must be linked.

---

## Activity Tracker

| Date | Calls | Emails | Meetings Logged | Notes | Call Target | Email Target |
|---|---|---|---|---|---|---|
| Mon 2 Mar | — | — | — | — | 15 | 10 |
| Tue 3 Mar | — | — | — | — | 15 | 10 |
| Wed 4 Mar | — | — | — | — | 15 | 10 |
| Thu 5 Mar | — | — | — | — | 15 | 10 |
| Fri 6 Mar | 3 | 0 | — | — | 15 | 10 |
| Sat 7 Mar | 0 | 0 | — | — | — | — |
| Sun 8 Mar | 0 | 0 | 0 | 0 | — | — |
| **Mon 9 Mar** | **0** | **0** | **6 scheduled** | **0** | **15** | **10** |

_As of 07:26 AEDT. Ben not yet active. Activity expected from ~8-9 AM._

---

## Run Log

| Run # | Timestamp (AEDT) | Type | Key Findings | Actions Taken |
|---|---|---|---|---|
| 001 | Sun 8 Mar 2026, 14:51 | Weekend Check | Pipeline snapshot captured. 4 alerts raised. Bulk import anomaly identified. 5 Monday meetings logged. | 0 tasks created (weekend). Memory initialised. |
| 002 | Sun 8 Mar 2026, 16:28 | Weekend Check | Pipeline stable. Meeting Booked -1. Submission Check stale +8. New Tuesday meeting (Michael Marks) detected. | 0 tasks created (weekend). Memory updated. ALERT-005 raised. ALERT-003 updated. |
| 003 | Mon 9 Mar 2026, 00:06 | Monday First Run | 6 meetings today. 7 overdue tasks confirmed. Total deal count +172 (unexplained). Aaron & Michael contacts found. Zero activity since Friday. | 6 tasks created. ALERT-006, ALERT-007 raised. Morning briefing generated. |
| 004 | Mon 9 Mar 2026, 03:23 | Overnight Check | Pipeline stable — 5,041 deals unchanged. 0 new contacts. 0 engagements. 13 tasks open, 0 completed. Michael Marks deal lookup confirmed: no active deal. | 0 tasks created. ALERT-008 raised. Memory updated. |
| 005 | Mon 9 Mar 2026, 06:26 | Morning Briefing | Pipeline stable — 5,041. 0 new contacts. 0 overnight activity. 13 tasks open, 3 formally overdue. 6 meetings confirmed. | 0 tasks created (all exist). Morning briefing issued. Memory updated. |
| 006 | Mon 9 Mar 2026, 07:26 | Morning Briefing | **ALERT-009: Lead stage 4,377 → 0. Total pipeline 5,041 → 664. Bulk Lead cohort deleted/removed overnight.** 0 new contacts. 0 activity. 13 tasks open (0 completed). 6 meetings confirmed via API — all unlinked. | 1 task to be created (ALERT-009 verification). ALERT-009 raised. Morning briefing issued. Memory updated. |

---

## Notes & Observations

- **🚨 BIGGEST NEW FINDING THIS RUN**: Lead stage dropped from 4,377 → 0. Total pipeline 5,041 → 664. The bulk import Lead cohort appears to have been deleted or archived overnight. This is likely intentional cleanup by Primal Zone team, but must be confirmed URGENTLY in case it was accidental — HubSpot recycle bin allows recovery within 90 days.
- **Remaining bulk cohorts intact**: Meeting Booked (238), Application (82-89), Submission Check (74-90), Doctor Review (66-74) — all unchanged. These need to be addressed as part of bulk import resolution.
- **6 meetings today, all unlinked** — API-confirmed. Even Aaron Peterson's named meeting shows associatedContacts: []. Link task is open and due in ~3.5 hours.
- **3 leads 2 days cold** — Jono, Trent, Shannon. These must be Ben's first three calls when he sits down.
- **Zero emails across 8 days** — Still the most concerning structural activity gap heading into the new week.
- **No new contacts this run** — Clean. No speed-to-lead actions required.
- **Next run**: ~8:30 AM AEDT. Ben should be active by then. First real activity check of the day.