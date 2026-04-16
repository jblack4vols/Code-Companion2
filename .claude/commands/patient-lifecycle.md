# Patient Lifecycle

Business rules for referral conversion, no-shows, discharge, and patient flow when coding CRM modules.

## Referral Status Flow
```
RECEIVED → SCHEDULED → ARRIVED → ACTIVE → DISCHARGED
                ↓
           NO_SHOW → RESCHEDULED → ARRIVED
                ↓
           CANCELLED
```

## Referral Statuses (from `shared/schema.ts`)
- **received** — referral logged, not yet contacted
- **scheduled** — appointment booked
- **arrived** — patient showed up for first visit
- **no_show** — patient missed appointment
- **cancelled** — referral cancelled
- **active** — currently in treatment
- **discharged** — treatment completed
- **converted** — successfully became a patient (arrived + active)

## Conversion Metrics
- **Arrival Rate:** `arrived / scheduled` — target >=70%
- **Conversion Rate:** `(arrived + active + discharged) / total_referrals`
- **No-Show Rate:** `no_show / scheduled` — alert if >20%
- **Days to Schedule:** time between `received` and `scheduled` dates
- **Days to Arrive:** time between `scheduled` and first visit

## Front Desk Module (`server/routes/frontdesk.ts`)
- **Patient Requests:** triage queue with levels RED/ORANGE/YELLOW/GREEN
- **Appointment Slots:** location + date + time, linked to patient requests
- **Status flow:** NEW → TRIAGED → SCHEDULED → WAITLISTED → COMPLETED → CANCELLED

## Location Scoping
- All patient/referral queries must use `getUserLocationScope()` for non-OWNER/DIRECTOR roles
- Referrals belong to locations via `locationId`
- Front desk staff see only their assigned locations

## Key Tables
- `referrals` — core referral records with status, dates, physician, location
- `patient_requests` — front desk triage queue
- `appointment_slots` — scheduling availability
- `collections` — payment/collection tracking per location

## Task
When coding patient lifecycle features for: $ARGUMENTS
1. Follow the status flow above — don't skip states
2. Track dates at each transition for metric calculation
3. Ensure location scoping on all queries
4. Use Zod validation on all status mutations
