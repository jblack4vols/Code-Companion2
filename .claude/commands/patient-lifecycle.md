---
name: patient-lifecycle
description: Load patient lifecycle business rules before coding conversion/attendance/discharge features
---

Before writing any patient lifecycle code, internalize these business rules for Tristar PT:

**The Three Lifecycle Modules:**

1. CONVERSION (case created → first visit)
   - Target: track weekly by referral source, payer, location, day of week
   - Flag: any location or payer with < 70% conversion rate
   - Bean Station is historically the softest-converting location — always include in alerts

2. ATTENDANCE (scheduled → showed)
   - Target arrival rate: 85%
   - High-risk no-show profile: new patient, Monday appointment, Medicaid/self-pay
   - Cancellation recovery: same-day cancel should trigger GHL re-engagement sequence
   - Johnson City: historically low visits-per-case — flag if < 8 visits/case

3. DISCHARGE (completion vs. dropout)
   - Discharge reason codes: COMPLETED, PLATEAU, INSURANCE_DENIAL, PATIENT_REQUEST,
     LOST_TO_FOLLOWUP, MOVED, FINANCIAL
   - Red flag: > 20% PATIENT_REQUEST or LOST_TO_FOLLOWUP at any single location
   - Track provider-level discharge reasons — outlier providers need coaching

**Key benchmarks:**
- Arrival rate target: 85%
- Visits per case target: ≥ 8
- Units per visit target: 4.0

Now implement the feature described in $ARGUMENTS using these rules.
