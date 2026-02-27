# At-Risk Referral Sources — Staff Workflow

## What "At-Risk" Means

A referral source is flagged as at-risk when **both** conditions are true:

1. **Referral volume dropped >20%** comparing the last 30 days to the prior 30 days
2. **No recent engagement** — either:
   - No touchpoint (interaction) logged in the past 30 days, OR
   - An overdue follow-up task exists (status OPEN, past due date)

This catches physicians who are sending fewer patients **and** have gone quiet — the combination most predictive of lost revenue.

## Where to Find It

- **Dashboard** — "At-Risk Referral Sources" card shows top 10 with decline % and risk signal
- **API** — `GET /api/at-risk-sources?locationId=&territoryId=` (roles: OWNER, DIRECTOR, MARKETER, ANALYST)

## Weekly Workflow

| Day | Action | Who |
|---|---|---|
| Monday | Review at-risk list on dashboard | Director / Marketer |
| Mon–Wed | Prioritize outreach to top 5 most-declined physicians | Marketer |
| Thu–Fri | Log interactions, update tasks, document outcomes | Marketer |
| Friday | Verify at-risk count is trending down | Director |

## Recommended Actions Per Risk Signal

### "No contact Xd"

The physician hasn't been contacted recently. Steps:

1. Schedule an office visit or phone call within the week
2. Bring referral volume data to the conversation ("We noticed referrals are down — how can we help?")
3. Log the interaction immediately after contact
4. Set a follow-up task for 2 weeks out

### "Overdue task"

A follow-up was planned but not completed. Steps:

1. Open the physician detail page and check the overdue task
2. Complete the task or reschedule if circumstances changed
3. If the task is no longer relevant, mark it DONE and create a new one
4. Prioritize clearing overdue tasks before creating new outreach

## Filters

- **Location** — Narrows to physicians who have referred to a specific clinic
- **Territory** — Narrows to physicians assigned to a specific territory

Use filters during territory-level reviews or location-specific meetings.

## FAQ

**Q: A physician shows -100% decline. What does that mean?**
They had referrals in the prior 30 days but zero in the current 30 days. This is the most urgent signal.

**Q: Why doesn't a physician with no prior referrals show up?**
By design. New physicians without history can't "decline." They should be managed via the relationship stage pipeline (NEW/DEVELOPING).

**Q: A physician was contacted yesterday but still shows as at-risk.**
The `lastInteractionAt` field on the physician record updates when interactions are logged. Verify the interaction was saved. The at-risk list refreshes on each page load.
