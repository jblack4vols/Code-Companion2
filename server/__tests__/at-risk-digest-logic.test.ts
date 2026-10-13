import { describe, it, expect } from "vitest";

/**
 * Pure logic for the at-risk referral email digest (mirrors transforms in
 * etl.ts sendAtRiskReferralDigests + outlook.ts sendAtRiskReferralDigestEmail):
 *   - map AtRiskSourceEntry -> email source row, dropping entries with no physician
 *   - risk-signal label rendering (no_contact w/ days, overdue follow-up)
 *   - recipient filtering: OWNER/DIRECTOR with a non-empty email
 */

interface Entry {
  physician: { firstName: string; lastName: string; practiceName: string | null } | null;
  changePercent: number;
  currentCount: number;
  priorCount: number;
  riskSignal: "no_contact" | "overdue_task";
  daysSinceContact: number | null;
}

function toSources(entries: Entry[]) {
  return entries
    .filter((s) => s.physician)
    .map((s) => ({
      name: `${s.physician!.firstName} ${s.physician!.lastName}`.trim(),
      practiceName: s.physician!.practiceName,
      changePercent: s.changePercent,
      currentCount: s.currentCount,
      priorCount: s.priorCount,
      riskSignal: s.riskSignal,
      daysSinceContact: s.daysSinceContact,
    }));
}

function signalLabel(riskSignal: "no_contact" | "overdue_task", daysSinceContact: number | null): string {
  return riskSignal === "no_contact"
    ? `No contact${daysSinceContact != null ? ` in ${daysSinceContact}d` : ""}`
    : "Overdue follow-up";
}

function digestRecipients(
  users: Array<{ email: string | null; name: string; role: string }>,
): Array<{ email: string; name: string }> {
  return users
    .filter((u) => (u.role === "OWNER" || u.role === "DIRECTOR") && !!u.email)
    .map((u) => ({ email: u.email as string, name: u.name }));
}

describe("at-risk digest source mapping", () => {
  it("maps entries and drops those without a physician", () => {
    const entries: Entry[] = [
      { physician: { firstName: "Jane", lastName: "Doe", practiceName: "Ortho TN" }, changePercent: -40, currentCount: 3, priorCount: 5, riskSignal: "no_contact", daysSinceContact: 45 },
      { physician: null, changePercent: -30, currentCount: 2, priorCount: 4, riskSignal: "overdue_task", daysSinceContact: null },
    ];
    const sources = toSources(entries);
    expect(sources).toHaveLength(1);
    expect(sources[0].name).toBe("Jane Doe");
    expect(sources[0].practiceName).toBe("Ortho TN");
  });
});

describe("risk signal label", () => {
  it("shows days since contact for no_contact", () => {
    expect(signalLabel("no_contact", 45)).toBe("No contact in 45d");
  });
  it("omits days when unknown", () => {
    expect(signalLabel("no_contact", null)).toBe("No contact");
  });
  it("labels overdue tasks", () => {
    expect(signalLabel("overdue_task", 5)).toBe("Overdue follow-up");
  });
});

describe("digest recipients", () => {
  it("keeps only OWNER/DIRECTOR with an email", () => {
    const recipients = digestRecipients([
      { email: "owner@x.com", name: "Owner", role: "OWNER" },
      { email: "dir@x.com", name: "Dir", role: "DIRECTOR" },
      { email: null, name: "NoEmail", role: "DIRECTOR" },
      { email: "mkt@x.com", name: "Mkt", role: "MARKETER" },
      { email: "fd@x.com", name: "FD", role: "FRONT_DESK" },
    ]);
    expect(recipients.map((r) => r.email)).toEqual(["owner@x.com", "dir@x.com"]);
  });
});
