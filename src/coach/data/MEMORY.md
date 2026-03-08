# Coach Memory — Active Items

> **Last updated**: Sunday, 8 March 2026 at 4:28 PM AEDT
> **Last run type**: Weekend Check (Reporting Only — No Tasks Created)

---

## Pipeline Snapshot

_Captured: Sunday 8 March 2026, 16:28 AEDT_

| Stage | Count | Δ Since Last Run | SLA | Stale Count (≥SLA) |
|---|---|---|---|---|
| Lead | 4,377 | — | 1 hour | 4,377+ (bulk import cohort) |
| Meeting Booked | 238 | -1 ✅ | 2 days | 238 (bulk import cohort) |
| Application | 92 | — | 3 days | 85 confirmed stale |
| Submission Check | 87 | — | 2 days | 71 confirmed stale (+8 vs last run) |
| Consultant | 0 | — | 3 days | 0 |
| Doctor Review | 74 | — | 3 days | 66 confirmed stale |
| Approved by Doctor | 162 | — | — | — |
| Cancelled | 11 | — | — | — |
| **TOTAL ACTIVE** | **4,869** | **-1** | | |

> ⚠️ **Bulk Import Note**: The bulk cohort created 2 March 2026 (18:23–21:10 UTC) continues to dominate all stages. All sampled stale deals in Doctor Review and Submission Check are confirmed bulk-import records ("MEN'S FULL HORMONE RESET" names, $0 amount, created within seconds of each other).

> ⚠️ **Submission Check Stale Count**: Previously 63 confirmed stale, now 71 — an increase of 8. This may reflect HubSpot query variance or additional deals crossing the 2-day SLA threshold. Monitor Monday.

> ✅ **Meeting Booked -1**: One deal moved out of Meeting Booked stage between 14:51 and 16:28 AEDT. This is a small positive signal — a deal progressed (or was cancelled/deleted). Unable to confirm direction without deal-level query.

---

## Active Alerts

### 🔴 ALERT-001 — Bulk Data Anomaly (CRITICAL — Needs Investigation Monday)
- **Raised**: 8 March 2026, 14:51 AEDT
- **Last confirmed**: 8 March 2026, 16:28 AEDT — **NO CHANGE**
- **Type**: Pipeline Integrity
- **Detail**: ~5,000 deals created on 2 March 2026 in a ~3-hour window (18:23–21:10 UTC) across Lead, Meeting Booked, Application, Submission Check, and Doctor Review stages. Deal names are generic ("MEN'S FULL HORMONE RESET", "WEIGHT LOSS, PERFORMANCE & INJURY REPAIR", "Doctor Consultation", "Lead — [Name]"). All carry $0 amounts. Consistent with a bulk CRM import or data migration.
- **Action Required Monday**: Confirm with Ben/Primal Zone — was this a planned migration? If yes, suspend SLA alerting for the bulk cohort and determine how to tag/segment these records. If no, investigate source urgently.
- **Risk**: SLA task creation on Monday without this context will generate thousands of irrelevant tasks.

### 🟡 ALERT-002 — Doctor Review Backlog (At Risk — Unchanged)
- **Raised**: 8 March 2026, 14:51 AEDT
- **Last confirmed**: 8 March 2026, 16:28 AEDT — **NO CHANGE** (66 stale, all bulk-import cohort in sample)
- **Type**: Stage SLA Breach
- **Detail**: 66 of 74 Doctor Review deals are 5+ days old (SLA = 3 days). Sampled deals are all "MEN'S FULL HORMONE RESET" bulk imports. However, any genuine post-consultation patients in this stage are time-sensitive — they're waiting to start treatment.
- **Action Required Monday**: Audit Doctor Review stage. Identify genuine post-consult patients vs. bulk records. Chase any real patients on doctor sign-off.

### 🟡 ALERT-003 — Monday Meeting Surge + New Tuesday Meeting (Updated)
- **Raised**: 8 March 2026, 14:51 AEDT
- **Updated**: 8 March 2026, 16:28 AEDT — **NEW MEETING ADDED**
- **Type**: Scheduling Notice
- **Detail**:
  - **Monday 9 March** — 5 confirmed meetings:
    | Time (AEDT) | Title | Contact | Status |
    |---|---|---|---|
    | 1:00 PM | 15 Min Discovery Call | Not linked | SCHEDULED |
    | 1:15 PM | 15 Min Discovery Call | Not linked | SCHEDULED |
    | 1:30 PM | 15 Min Discovery Call | Not linked | SCHEDULED |
    | 3:00 PM | Aaron Peterson & Primal Zone | Not linked in HubSpot | No outcome set |
    | 6:45 PM | 15 Min Discovery Call | Not linked | SCHEDULED |
  - **Tuesday 10 March** — 1 new meeting (added since last run):
    | Time (AEDT) | Title | Contact | Status |
    |---|---|---|---|
    | 4:30 PM | Michael Marks & Primal Zone | Not linked in HubSpot | No outcome set |
  - Also on Tuesday 10 March: 1 × "15 Min Discovery Call" at 1:00 PM AEDT (RESCHEDULED status) and 1 × "15 Min Discovery Call" at 6:00 PM AEDT (SCHEDULED).
- **Action Required Monday AM**: Ben to confirm all meetings, link contacts in HubSpot, and prep for Aaron Peterson (3:00 PM) and Michael Marks (Tuesday 4:30 PM).

### 🟡 ALERT-004 — Activity Levels Low (Friday 7 March — No Weekend Change Expected)
- **Raised**: 8 March 2026, 14:51 AEDT
- **Last confirmed**: 8 March 2026, 16:28 AEDT — **NO CHANGE** (weekend, expected)
- **Type**: Activity Below Target
- **Detail**: Since Friday 6 March, Ben logged: 3 calls (target: 15/day), 0 emails (target: 10/day), 0 notes. Weekend inactivity is expected. Monitor Monday closely for reset.
- **Action Required Monday**: Push Ben to hit 15 calls + 10 emails to reset the week strong.

### 🟡 ALERT-005 — Submission Check Stale Count Increased (New)
- **Raised**: 8 March 2026, 16:28 AEDT
- **Type**: Stage SLA Variance / Monitor
- **Detail**: Confirmed stale deals in Submission Check increased from 63 to 71 between the 14:51 and 16:28 runs (+8 deals). Total Submission Check count unchanged at 87. The additional 8 are almost certainly from the bulk import cohort crossing the query threshold. However, worth noting in case it reflects genuine new deals sitting unreviewed.
- **Action Required Monday**: Confirm with investigation of ALERT-001. Include in Submission Check sweep.

---

## Monday Morning Priority Queue

> To be converted to tasks on first Monday run (from ~06:00 AEDT)

1. **[CRITICAL] Investigate bulk import** — Confirm with Ben/Primal Zone whether the ~5,000 deal batch created 2 March was intentional. Determine how to handle SLA alerting for legacy records. Do NOT fire SLA tasks against bulk cohort until confirmed.
2. **[HIGH] Doctor Review audit** — 66 stale deals. Identify genuine post-consult patients awaiting doctor sign-off. Chase approvals — patients are waiting to start treatment.
3. **[HIGH] Monday meetings prep** — 5 meetings today. Prep Aaron Peterson (3:00 PM). Confirm all contacts are linked in HubSpot. Note Michael Marks on Tuesday 4:30 PM — search for his contact record and prep.
4. **[MEDIUM] Submission Check sweep** — 71 stale deals (up from 63). Identify genuine applications awaiting review.
5. **[MEDIUM] Application follow-up sweep** — 85+ stale deals. Identify genuine incomplete applications and chase.
6. **[MEDIUM] Link contacts to all Monday/Tuesday meetings** — None of the 5 Monday meetings have associated contacts in HubSpot. Ben to update.
7. **[LOW] Activity reset** — Push Ben to hit 15 calls + 10 emails Monday. Zero emails logged all week is a gap to address.
8. **[LOW] Cancelled deals reactivation review** — 11 cancelled deals. Check dates — any in the 30-90 day reactivation window should be flagged for win-back.

---

## Upcoming Meetings

### Monday 9 March 2026
| Time (AEDT) | Title | Contact | HubSpot Meeting ID | Status |
|---|---|---|---|---|
| 1:00 PM | 15 Min Discovery Call | Not linked | 355652499171 | SCHEDULED |
| 1:15 PM | 15 Min Discovery Call | Not linked | 356464643796 | SCHEDULED |
| 1:30 PM | 15 Min Discovery Call | Not linked | 356564025034 | SCHEDULED |
| 3:00 PM | Aaron Peterson & Primal Zone | Not linked | 356575393507 | No outcome |
| 6:45 PM | 15 Min Discovery Call | Not linked | 356812426957 | SCHEDULED |

### Tuesday 10 March 2026
| Time (AEDT) | Title | Contact | HubSpot Meeting ID | Status |
|---|---|---|---|---|
| 1:00 PM | 15 Min Discovery Call | Not linked | 356549499578 | SCHEDULED |
| 4:30 PM | Michael Marks & Primal Zone | Not linked | 356575512259 | No outcome |
| 6:00 PM | 15 Min Discovery Call | Not linked | 356674535155 | RESCHEDULED |

### Thursday 12 March 2026
| Time (AEDT) | Title | Contact | HubSpot Meeting ID | Status |
|---|---|---|---|---|
| 4:30 PM | 15 Min Discovery Call | Not linked | 356622308066 | SCHEDULED |

---

## Open Tasks (HubSpot)

_No open tasks found in HubSpot for Ben (owner ID: 161661298) as of this run._

---

## Recent Engagements (Since Fri 6 March 2026)

| Type | Count | Target | Status |
|---|---|---|---|
| Calls | 3 | 15/day | 🔴 Below target |
| Emails | 0 | 10/day | 🔴 Below target |
| Meetings | 11 (logged) | — | ✅ Strong |
| Notes | 0 | — | ⚠️ None logged |

**Call detail (all Sat 7 Mar UTC / Fri 6 Mar AEDT):**
- ❌ Thomas Tenaglia — FAILED (0 duration)
- ✅ Matt Stirling — Completed (9s — likely voicemail)
- ✅ Ali Abbas — Completed (47s — brief connect or voicemail)

**Meeting pipeline (this week):**
- 2 × RESCHEDULED (Fri 6 Mar)
- 1 × CANCELLED (Fri 6 Mar)
- 5 × SCHEDULED for Monday 9 March
- 3 × SCHEDULED/upcoming for Tue 10 – Thu 12 March
- 1 × NEW named meeting added Sun 8 March (Michael Marks, Tue 10 March)

---

## Run Log

| Run # | Timestamp (AEDT) | Type | Key Findings | Actions Taken |
|---|---|---|---|---|
| 001 | Sun 8 Mar 2026, 14:51 | Weekend Check | Pipeline snapshot captured. 4 alerts raised. Bulk import anomaly identified. 5 Monday meetings logged. | 0 tasks created (weekend). Memory initialised. |
| 002 | Sun 8 Mar 2026, 16:28 | Weekend Check | Pipeline stable. Meeting Booked -1. Submission Check stale +8. New Tuesday meeting (Michael Marks) detected. No new weekend contacts. | 0 tasks created (weekend). Memory updated. ALERT-005 raised. ALERT-003 updated. |

---

## Notes & Observations

- **Pipeline stable** — No significant overnight changes. The -1 in Meeting Booked is a micro-positive signal.
- **Michael Marks meeting is new** — Added to HubSpot between 14:51 and 16:28 AEDT on Sunday. This is a named meeting (not a generic discovery call), suggesting a warm prospect. Ben or the patient booked this over the weekend. Search for Michael Marks contact record on Monday and prep notes.
- **Zero emails all week** — Ben is not logging email activity in HubSpot. Either he's not sending follow-up emails, or he's sending them outside of HubSpot. This is a significant gap in the TRT nurture sequence. Needs to be raised Monday — email follow-up after calls/meetings is critical for this patient type.
- **No new weekend leads** — Contact search returned no new patient enquiries over the weekend. This is normal for Sunday; Monday morning may bring new leads from weekend ad traffic.
- **Meetings booking well** — 11 total meetings logged since Friday including 8 upcoming. Ben's top-of-funnel activity (booking calls) is strong. The conversion of these meetings into Applications is the key metric to track this week.
- **Reactivation opportunity** — 11 Cancelled deals. Once bulk import investigation is resolved, review these for 30-90 day win-back potential.
- **Tuesday is going to be busy** — With 3 meetings on Tuesday (including the named Michael Marks meeting) plus any Monday follow-up actions, Tuesday will be a high-activity day. Ben should prep Sunday night/Monday morning.