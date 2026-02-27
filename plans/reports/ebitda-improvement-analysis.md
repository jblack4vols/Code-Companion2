# EBITDA Improvement & Expense Reduction Analysis

**System:** TriStar 360° — Physician Referral CRM  
**Date:** 2026-02-27  
**Scope:** 8-location PT practice  
**Type:** Gap analysis — current capabilities vs. EBITDA-impacting opportunities

---

## 1. Current Capabilities Summary

### What the System Already Does Well

**Referral Pipeline Management (Strong)**
- Full referral lifecycle tracking: RECEIVED → SCHEDULED → EVAL_COMPLETED → DISCHARGED → LOST
- Conversion funnel visualization (referral → scheduled → arrived)
- Referral-to-first-visit time tracking (`createdToArrived`, `dateOfFirstScheduledVisit`, `dateOfFirstArrivedVisit`)
- Scheduled vs. arrived visit tracking per referral (`scheduledVisits`, `arrivedVisits`)
- Patient account number, insurance, payer type, diagnosis category captured
- Unlinked referral resolution workflow with NPI lookup and auto-matching
- Declining referral detection with period-over-period comparison

**Physician Relationship Management (Strong)**
- Multi-dimensional tiering (A/B/C/D) based on revenue, growth trend, conversion, payer mix
- Configurable tiering weights via `tiering_weights` table
- Automated relationship stage transitions via ETL (NEW → ACTIVE → AT_RISK → INACTIVE)
- Stage history tracking with audit trail
- At-risk referral source detection (decline >20% + no touchpoint in 30d)
- Provider scorecard with health gauge
- Practice intelligence (practice-level aggregation of physicians, referrals, revenue)
- Physician favorites, comments, custom fields
- Territory management with rep assignment

**Revenue Recovery Engine (Strong)**
- Claims tracking with billed/paid/expected/adjustment amounts
- Payer rate schedule for underpayment detection (expected vs. actual)
- Denial intelligence: top codes, provider outliers, monthly trends
- Appeal lifecycle: DRAFTED → SUBMITTED → WON/LOST with recovery tracking
- Appeal template system with denial code pattern matching
- Reimbursement summary by payer with realization %
- Revenue dashboard with KPI cards (total underpaid, recovery rate, appeals won, recovered)

**Billing Lag & AR Management (Strong)**
- AR aging buckets (0-30, 31-60, 61-90, 90+)
- Cycle time metrics (avg days to submit, avg days to pay, avg cycle time)
- Breakdown by payer and by location
- Stale claims identification (claims not submitted within threshold)
- Alert engine: HIGH_BILLING_LAG, HIGH_AR_AGING auto-detection

**Unit Economics (Strong)**
- Location-level financials: gross revenue, visits, units, labor/rent/supplies/other costs
- Revenue per visit, cost per visit, labor %, net margin, net contribution
- Color-coded heat map across all 8 locations
- Provider productivity tracking (visits, units, units/hour, hours, revenue, revenue target)
- Financial alerts engine (LOW_REVENUE_PER_VISIT, HIGH_COST_PER_VISIT, HIGH_LABOR_PERCENT, LOW_PROVIDER_REVENUE)
- Configurable financial targets and thresholds per location
- 4-week revenue forecast per location with trend direction and confidence score

**Marketing & Operations (Good)**
- Daily Hit List (weekly agenda with events, tasks, follow-ups)
- Team leaderboard (interactions, referrals generated/converted, tasks completed, performance score)
- ROI calculator per provider (revenue, referrals, visits, revenue/referral, visits/referral)
- Goal tracking per territory and location (target referrals, target revenue)
- Interaction templates for standardized logging
- Calendar/Outlook sync
- Scheduled report generation and email delivery (referral summary, interaction summary, provider pipeline)
- Overdue task email digests
- User inactivity monitoring

**Data Infrastructure (Good)**
- Nightly ETL computing physician/location/territory monthly summaries
- Incremental ETL (only recomputes affected months)
- GoHighLevel and custom API integration framework
- SharePoint sync via Graph API
- Public API with scoped API keys
- CSV import for referrals, claims, provider data
- Audit logging on mutations

---

## 2. High-Impact Feature Opportunities

### Ranked by Estimated EBITDA Impact

| # | Feature | EBITDA Impact | Complexity | Priority |
|---|---------|:---:|:---:|:---:|
| 1 | Authorization/Visit Utilization Tracker | High | Medium | P0 |
| 2 | Payer Profitability Matrix | High | Low | P0 |
| 3 | Referral-to-Revenue Attribution (End-to-End) | High | Medium | P0 |
| 4 | No-Show/Cancellation Tracking & Prediction | High | Medium | P1 |
| 5 | Scheduling Density Optimizer | High | High | P1 |
| 6 | Marketer Cost-to-Revenue ROI | Medium | Low | P0 |
| 7 | Front-Desk Conversion Accountability | Medium | Low | P1 |
| 8 | Payer Contract Performance Monitor | Medium | Medium | P1 |
| 9 | Patient Visit Completion Rate Tracker | Medium | Medium | P1 |
| 10 | Automated Referral Follow-Up Workflows | Medium | Medium | P2 |
| 11 | Predictive Referral Source Scoring | Medium | High | P2 |
| 12 | Location P&L Dashboard with EBITDA Rollup | Medium | Low | P1 |
| 13 | Therapist Utilization & Capacity Planning | Medium | Medium | P2 |
| 14 | Insurance Verification Status Tracking | Medium | Medium | P2 |

---

### Detailed Feature Descriptions

#### 1. Authorization/Visit Utilization Tracker
**EBITDA Impact: HIGH | Complexity: MEDIUM**

**Problem:** PT practices lose significant revenue from authorized visits that expire unused. A patient may be authorized for 24 visits but only complete 12. The system currently tracks `scheduledVisits` and `arrivedVisits` per referral but has no concept of authorized visits, authorization expiration dates, or remaining visit alerts.

**Financial mechanism:** In a typical PT practice, 15-25% of authorized visits go unused. For an 8-location practice doing ~800 visits/week at ~$95/visit, even recovering 10% of unused auths = ~$40K/month incremental revenue.

**What to build:**
- Add `authorizedVisits` (int), `authExpirationDate` (date), `authNumber` (varchar) to referrals table
- Dashboard widget: "Expiring Authorizations" (auths expiring in next 14/30 days with remaining visits)
- Alert: referrals where `arrivedVisits / authorizedVisits < 50%` and auth expires within 30 days
- KPI: "Auth Utilization Rate" = total arrived visits / total authorized visits
- Staff-facing list: "Patients to call back" sorted by auth expiration and remaining visits

**Data already available:** `scheduledVisits`, `arrivedVisits`, `patientPhone`, `patientFullName`, `primaryInsurance` — all exist in the referrals table.

---

#### 2. Payer Profitability Matrix
**EBITDA Impact: HIGH | Complexity: LOW**

**Problem:** The system tracks payer type (COMMERCIAL, MEDICARE, MEDICAID, CASH) and has a `payer_rate_schedule` table, but there is no view that shows which payers are most/least profitable after factoring in denial rates, billing lag, and collection rates. Practice leadership cannot see "should we drop Payer X or renegotiate?"

**Financial mechanism:** Payer mix optimization is the #1 lever for PT practice EBITDA. A 5% shift from low-reimbursement Medicaid to commercial can increase revenue per visit by $20-30. For 800 visits/week, 5% = 40 visits, $20/visit = $800/week = $42K/year.

**What to build:**
- Cross-reference existing `claims` data (billed, paid, expected, denied) with `payer_rate_schedule`
- Matrix view: Payer x {Avg reimbursement, Denial rate, Collection rate, Avg days to pay, Net revenue/visit}
- Color-code: green (profitable), yellow (marginal), red (unprofitable)
- Trend: payer profitability over last 6 months (catching rate cuts early)

**Data already available:** `claims` table has payer, billedAmount, paidAmount, expectedAmount, denialCodes, status. `payer_rate_schedule` has expected rates by CPT. Revenue recovery dashboard already aggregates by payer — just needs the profitability lens.

---

#### 3. Referral-to-Revenue Attribution (End-to-End)
**EBITDA Impact: HIGH | Complexity: MEDIUM**

**Problem:** The system tracks referral volume and has `valueEstimate` on referrals, but there is no closed-loop connection from a referral through to actual collected revenue via claims. The `valueEstimate` field is a manual estimate. The `claims` table has `patientAccountNumber` and the `referrals` table has `patientAccountNumber` but no automated join/reconciliation exists.

**Financial mechanism:** Without attribution, leadership cannot answer "what is the true lifetime value of referrals from Dr. Smith?" The tiering algorithm uses `valueEstimate` (a guess) instead of actual collections. Accurate attribution enables: (a) correct tiering decisions, (b) identifying which physician referrals produce the highest revenue per referral, (c) justifying marketing spend on specific physicians.

**What to build:**
- Automated referral-to-claims linking via `patientAccountNumber` (field exists on both tables)
- Materialized view: referral → all claims → total billed, total collected, total denied
- Replace `valueEstimate` with actual collected amount in tiering calculations
- Physician ROI dashboard update: show actual collections per referral, not estimates
- ETL enhancement: aggregate actual claim revenue back to physician monthly summary

**Data already available:** Both `referrals.patientAccountNumber` and `claims.patientAccountNumber` exist. The join key is there — just not being used.

---

#### 4. No-Show/Cancellation Tracking & Prediction
**EBITDA Impact: HIGH | Complexity: MEDIUM**

**Problem:** The system tracks `scheduledVisits` and `arrivedVisits` at the referral level, but has no visit-level no-show/cancellation data. For PT practices, no-show rates of 10-15% directly destroy revenue — and empty slots cannot be recovered. There is no ability to identify chronic no-show patients, no-show patterns by day/time/location, or triggering of overbooking recommendations.

**Financial mechanism:** 8 locations averaging 12% no-show rate = ~96 empty visits/week. At $95/visit = $9,120/week lost = $474K/year. Reducing no-shows from 12% to 8% = $158K/year in recovered revenue.

**What to build:**
- New table: `visits` (date, time, location, therapist, patient, status: SCHEDULED/ARRIVED/NO_SHOW/CANCELLED/LATE_CANCEL)
- Import integration from EMR/scheduling system
- Dashboard: no-show rate by location, by day-of-week, by time slot, by therapist
- Patient risk scoring: flag patients with >2 no-shows for proactive outreach
- Alert: locations where no-show rate exceeds threshold

**Data already available:** Location, therapist, patient info exists. Need visit-level granularity (currently only aggregate on referral).

---

#### 5. Scheduling Density Optimizer
**EBITDA Impact: HIGH | Complexity: HIGH**

**Problem:** No visibility into how full each location's schedule is. Empty slots = lost revenue. Over-scheduled slots = burnout and quality issues. The system has `provider_productivity` (visits, hours) but no real-time schedule utilization view.

**Financial mechanism:** Improving schedule fill rate from 80% to 90% across 8 locations = 10% more visits = $394K/year additional revenue.

**What to build:**
- Capacity model per location: available slots per day (based on therapist hours and treatment duration)
- Utilization metric: filled slots / available slots per location per day
- Heatmap: scheduling density by day-of-week and time-of-day
- Recommendation engine: redirect new patient intake to under-utilized locations
- Integration with referral routing: when a new referral comes in, suggest the nearest location with best availability

**Data gaps:** Requires therapist schedule data and treatment duration standards. `provider_productivity` tracks hours and visits but not granular slot-level data.

---

#### 6. Marketer Cost-to-Revenue ROI
**EBITDA Impact: MEDIUM | Complexity: LOW**

**Problem:** The system has a team leaderboard showing marketer activity (interactions, referrals generated) and ROI calculator showing revenue per provider. But there is no view that says "Marketer Jane costs $75K/year + $15K travel/meals. Her assigned physicians generated $X revenue. Her ROI is Y:1." This is critical for an 8-location practice that likely employs 2-4 marketers.

**Financial mechanism:** Identifying underperforming marketer territories enables reallocation. If Marketer A generates $500K from 50 interactions/month and Marketer B generates $200K from 60 interactions/month, the problem is B's physician assignments, not effort.

**What to build:**
- Add `annualCompensation` (numeric) and `travelBudget` (numeric) fields to users table (for MARKETER role)
- Dashboard: marketer → assigned physicians → total revenue from those physicians → cost of marketer → ROI ratio
- Time-spent analysis: interactions per physician × estimated time per interaction type
- Territory profitability: territory revenue minus marketer cost = territory net contribution

**Data already available:** `users` (role=MARKETER), `physicians.assignedOwnerId`, `physicianMonthlySummary.revenueGenerated`, `interactions` (count per marketer), `territories.repUserId`. Just needs the cost side.

---

#### 7. Front-Desk Conversion Accountability
**EBITDA Impact: MEDIUM | Complexity: LOW**

**Problem:** When a referral comes in, someone (front desk) must call the patient and schedule them. The system tracks `referralDate` and `dateOfFirstScheduledVisit` but does not track who called, when, how many attempts, and whether the patient was reached. Referrals that never convert to scheduled visits are "leaked" revenue.

**Financial mechanism:** If 20% of referrals never get scheduled, and each referral is worth ~$1,200 (10 visits × $120/visit), losing 20% = massive revenue leakage. Improving scheduling rate from 80% to 90% on 200 referrals/month = 20 more patients = $24K/month.

**What to build:**
- Add to referrals: `firstContactAttemptAt` (timestamp), `contactAttempts` (int), `contactedBy` (userId)
- "Unscheduled Referrals" queue: referrals older than 48 hours with no `dateOfFirstScheduledVisit`
- Aging buckets: 0-24hr (green), 24-48hr (yellow), 48-72hr (orange), 72+ hr (red)
- Per-user metric: front desk staff → avg time to first contact, scheduling conversion rate
- Daily alert: "X referrals have not been contacted in 48+ hours"

**Data already available:** `referralDate`, `dateOfFirstScheduledVisit`, `locationId`. The referral status flow (RECEIVED → SCHEDULED) exists. Just needs contact tracking granularity.

---

#### 8. Payer Contract Performance Monitor
**EBITDA Impact: MEDIUM | Complexity: MEDIUM**

**Problem:** The `payer_rate_schedule` table stores expected rates by CPT code, and claims track actual payments. But there is no automated detection of payers systematically paying below contracted rates. Underpayment detection exists (is_underpaid flag) but is per-claim, not a pattern analysis that triggers contract renegotiation.

**Financial mechanism:** Payer rate drift (paying 3-5% below contract) is extremely common in PT. For $4M annual collections, 3% underpayment = $120K/year recoverable.

**What to build:**
- Payer contract compliance dashboard: expected rate vs. actual average paid rate by payer × CPT
- Trend detection: "Payer X has paid 4% below expected rate for 3 consecutive months"
- Escalation workflow: flag payer for contract review when variance exceeds threshold
- Annual renegotiation calendar: which payer contracts are up for renewal and what is their performance

**Data already available:** `payer_rate_schedule` (expected), `claims` (actual paid), both indexed by payer and CPT code.

---

#### 9. Patient Visit Completion Rate Tracker
**EBITDA Impact: MEDIUM | Complexity: MEDIUM**

**Problem:** Patients who drop out of care early reduce revenue per referral. The system has `arrivedVisits` and `dischargeDate`/`dischargeReason` but no "plan of care completion" metric. In PT, a typical plan of care is 12-20 visits. If avg patient completes only 8, there is significant revenue leakage.

**Financial mechanism:** If avg plan of care is 15 visits but avg completed is 9, and practice sees 200 new patients/month, that is 200 × 6 missed visits × $95 = $114K/month in lost revenue. Improving completion by even 2 visits = $38K/month.

**What to build:**
- Add `plannedVisits` (int) or `planOfCareVisits` (int) to referrals
- KPI: "Plan of Care Completion Rate" = arrivedVisits / plannedVisits
- Dropout risk scoring: patients who miss 2+ consecutive appointments
- By-therapist analysis: which therapists have highest/lowest completion rates
- By-diagnosis analysis: which diagnosis categories have worst completion rates
- Outreach list: patients who have not been seen in 14+ days with remaining planned visits

**Data already available:** `arrivedVisits`, `dischargeDate`, `dischargeReason`, `caseTherapist`, `diagnosisCategory`. Needs `plannedVisits` field.

---

#### 10. Automated Referral Follow-Up Workflows
**EBITDA Impact: MEDIUM | Complexity: MEDIUM**

**Problem:** The system has tasks and follow-up tracking, but workflow automation is manual. Staff must remember to create tasks. There are no automated triggers like "if referral status = RECEIVED for 48 hours and no scheduled visit, create HIGH priority task for front desk."

**What to build:**
- Configurable workflow rules engine: trigger → condition → action
- Example rules:
  - Referral RECEIVED + 48hrs no schedule → create task for front desk
  - Patient no-show → create task for front desk "call to reschedule"
  - Auth expiring in 14 days with remaining visits → create task for therapist
  - Physician stage changed to AT_RISK → create task for assigned marketer
- Template-based: define workflow templates, apply per location or globally

**Data already available:** All the trigger data exists (referral status, dates, physician stages). The task creation system works. Just needs the automation layer.

---

#### 12. Location P&L Dashboard with EBITDA Rollup
**EBITDA Impact: MEDIUM | Complexity: LOW**

**Problem:** The unit economics dashboard shows per-location financials (revenue, costs, margin) but does not roll up to a practice-wide EBITDA view. Leadership cannot see "what is our total practice EBITDA this month?" or "which locations are dragging EBITDA down?"

**What to build:**
- Summary row on unit economics dashboard: total across all locations
- EBITDA calculation: gross revenue - labor - rent - supplies - other = EBITDA per location
- Practice-wide EBITDA trend (monthly chart)
- Location contribution ranking: which locations contribute most to practice EBITDA
- Breakeven analysis: what visit volume does each location need to break even?

**Data already available:** `clinic_financials` has all the line items (grossRevenue, laborCost, rentCost, suppliesCost, otherFixedCosts, netContribution). Just needs aggregation and EBITDA-specific display.

---

## 3. Quick Wins (Low Complexity, Immediate Impact)

These features can be built with existing data and minimal schema changes.

### QW-1: Payer Profitability Matrix View
- **Effort:** 1-2 days
- **Impact:** Informs payer mix strategy worth $42K+/year
- **How:** New page joining `claims` aggregates with `payer_rate_schedule`. All data exists.

### QW-2: Marketer ROI Dashboard
- **Effort:** 1-2 days
- **Impact:** Identifies under/over-performing marketer territories
- **How:** Join `users` (marketers) → `physicians` (assigned) → `physicianMonthlySummary` (revenue). Add compensation fields.

### QW-3: Practice-Wide EBITDA Rollup
- **Effort:** 0.5-1 day
- **Impact:** Executive-level visibility into practice financial health
- **How:** Aggregate existing `clinic_financials` data with subtotal row and trend chart.

### QW-4: Referral-to-Claims Auto-Linking
- **Effort:** 1-2 days
- **Impact:** Enables accurate revenue attribution (foundation for items #1, #3)
- **How:** Join on `patientAccountNumber` (exists on both tables). Build reconciliation query + display.

### QW-5: Unscheduled Referral Aging Queue
- **Effort:** 0.5-1 day
- **Impact:** Prevents referral leakage at intake
- **How:** Filter referrals where `status = RECEIVED` and `dateOfFirstScheduledVisit IS NULL` and age > 48h. Color-coded by urgency.

### QW-6: Authorization Expiration Alert (Minimal)
- **Effort:** 1 day (add 2 columns + simple query)
- **Impact:** Captures revenue from expiring authorizations
- **How:** Add `authorizedVisits` and `authExpirationDate` to referrals. Build "expiring soon" list.

---

## 4. Strategic Initiatives (Transformative, Higher Effort)

### SI-1: EMR/Scheduling System Integration
**What:** Bi-directional sync with the practice's EMR (likely WebPT, Clinicient, or similar) to pull real-time visit data, no-show data, and authorization info.

**Why:** Most of the high-impact features above (#4 No-Shows, #5 Scheduling Density, #9 Visit Completion) require visit-level data that currently must be manually imported. EMR integration would automate this and provide real-time dashboards.

**Impact:** Unlocks $500K+/year in optimization opportunities by providing data currently invisible.

**Complexity:** High — depends on EMR vendor API availability, data mapping, ongoing sync.

### SI-2: Predictive Analytics Layer
**What:** Machine learning models for:
- Referral volume forecasting per physician (using historical patterns)
- Patient dropout prediction (based on visit patterns, diagnosis, payer)
- Physician churn prediction (before stage transitions to AT_RISK)

**Why:** Proactive intervention is 3-5x more effective than reactive. The system already has 6+ months of historical data in monthly summaries.

**Impact:** 10-15% improvement in referral retention and patient completion rates.

**Complexity:** High — requires ML infrastructure, model training, ongoing retraining.

### SI-3: Patient Communication Automation
**What:** Automated patient outreach via SMS/email for:
- Appointment reminders (reduce no-shows)
- Re-engagement for dropped patients
- Auth expiration notifications
- Satisfaction surveys post-discharge

**Why:** Manual phone calls are expensive ($15-20/call fully loaded) and inconsistent. Automated messaging scales.

**Impact:** 30-50% reduction in no-shows ($50-80K/year), improved plan of care completion.

**Complexity:** Medium-High — requires SMS gateway integration, patient consent management, opt-out handling.

---

## 5. Implementation Priority Roadmap

### Phase 1: Quick Wins (Weeks 1-3)
1. QW-5: Unscheduled Referral Aging Queue
2. QW-3: Practice-Wide EBITDA Rollup
3. QW-4: Referral-to-Claims Auto-Linking
4. QW-1: Payer Profitability Matrix
5. QW-2: Marketer ROI Dashboard

**Estimated EBITDA impact:** $60-100K/year from behavioral changes enabled by visibility.

### Phase 2: High-Impact Features (Weeks 4-10)
1. Feature #1: Authorization/Visit Utilization Tracker
2. Feature #7: Front-Desk Conversion Accountability
3. Feature #6: Marketer Cost-to-Revenue ROI (full version)
4. Feature #8: Payer Contract Performance Monitor

**Estimated EBITDA impact:** $150-250K/year from recovered revenue and optimized operations.

### Phase 3: Operational Excellence (Weeks 11-18)
1. Feature #4: No-Show/Cancellation Tracking
2. Feature #9: Patient Visit Completion Rate Tracker
3. Feature #10: Automated Referral Follow-Up Workflows
4. Feature #12: Location P&L with EBITDA (enhanced)

**Estimated EBITDA impact:** $200-400K/year from reduced leakage and improved patient retention.

### Phase 4: Strategic (Weeks 19+)
1. SI-1: EMR Integration
2. Feature #5: Scheduling Density Optimizer
3. SI-2: Predictive Analytics
4. SI-3: Patient Communication Automation

**Estimated EBITDA impact:** $300-500K/year (cumulative with earlier phases).

---

## 6. Data the System Collects But Does Not Act On

| Data Point | Current Use | Untapped Potential |
|---|---|---|
| `patientAccountNumber` on both referrals and claims | Display only | **Referral-to-revenue attribution** (join key exists, unused) |
| `caseTherapist` on referrals | Display only | **Therapist-level conversion and completion analysis** |
| `diagnosisCategory` on referrals | Display only | **Diagnosis-level profitability and completion analysis** |
| `primaryInsurance` / `primaryPayerType` on referrals | Basic payer mix % in tiering | **Payer profitability analysis, auth tracking by payer** |
| `dischargeReason` on referrals | Display only | **Dropout pattern analysis, preventable discharge identification** |
| `discipline` on referrals | Display only | **Service line profitability (PT vs OT vs SLP)** |
| `scheduledVisits` vs `arrivedVisits` per referral | Arrival rate metric | **Per-patient no-show identification, scheduling effectiveness** |
| `dateOfFirstScheduledVisit` and `dateOfFirstArrivedVisit` | Avg time-to-visit KPI | **Front desk scheduling speed accountability** |
| `cptCodes` on claims | Display only | **CPT-level profitability, procedure mix optimization** |
| Interaction frequency per physician | Leaderboard/correlation chart | **Marketing cost allocation, diminishing returns detection** |

---

## 7. Success Metrics

| Metric | Current Baseline (Estimated) | 12-Month Target |
|---|---|---|
| Auth Utilization Rate | Unknown (not tracked) | >85% |
| Referral Scheduling Rate (<48hr) | Unknown (not tracked) | >90% |
| Overall Conversion Rate (referral → arrived) | Tracked (dashboard) | +10% improvement |
| Avg Revenue Per Referral | Tracked (estimate-based) | Switch to actual collections |
| No-Show Rate | Unknown (not tracked) | <8% |
| Denial Rate | Tracked (denial dashboard) | <8% |
| Billing Lag (DOS → Submission) | Tracked (billing lag page) | <3 days |
| Plan of Care Completion Rate | Unknown (not tracked) | >75% |
| Payer Realization Rate | Tracked (revenue dashboard) | >95% |
| Practice EBITDA | Not rolled up in system | Tracked and trended |

---

## 8. Unresolved Questions

1. **EMR System:** What EMR/practice management system is in use? This determines integration feasibility for visit-level data.
2. **Data Import Frequency:** How often are referrals and claims imported currently? Manual CSV or automated?
3. **Authorization Data:** Is auth information available in the EMR or managed separately? This affects Feature #1 scope.
4. **Scheduling System:** Is scheduling managed in the EMR or a separate tool? Determines Feature #5 feasibility.
5. **Marketer Compensation:** Is this data sensitive/accessible for the ROI calculation? May need OWNER-only gating.
6. **Visit-Level Data:** Is there any existing visit-level export (not just aggregate on referral) that could feed no-show tracking?
7. **Current No-Show Rate:** What does leadership estimate their no-show rate is? This validates the business case.
8. **Payer Contract Renewal Dates:** Are these tracked anywhere? Important for Feature #8 timing.
