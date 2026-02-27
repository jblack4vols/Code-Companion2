import { describe, it, expect } from "vitest";

/**
 * Pure computation logic extracted from getAtRiskReferralSources.
 * Tests the core algorithm without database dependencies.
 */

interface ReferralCount {
  physicianId: string;
  count: number;
}

interface PhysicianInfo {
  id: string;
  firstName: string;
  lastName: string;
  practiceName: string | null;
  lastInteractionAt: Date | null;
  territoryId: string | null;
  deletedAt: Date | null;
}

interface TaskInfo {
  physicianId: string;
  status: string;
  dueAt: Date;
}

function computeAtRiskSources(
  currentCounts: ReferralCount[],
  priorCounts: ReferralCount[],
  physicianList: PhysicianInfo[],
  taskList: TaskInfo[],
  now: Date,
  filters?: { locationId?: string; territoryId?: string },
  referralLocationMap?: Map<string, string[]>,
) {
  const touchpointCutoff = new Date(now);
  touchpointCutoff.setDate(touchpointCutoff.getDate() - 30);

  // Filter eligible physicians (not soft-deleted)
  let eligible = physicianList.filter((p) => !p.deletedAt);
  if (filters?.territoryId) {
    eligible = eligible.filter((p) => p.territoryId === filters.territoryId);
  }
  if (filters?.locationId && referralLocationMap) {
    eligible = eligible.filter((p) => {
      const locs = referralLocationMap.get(p.id) || [];
      return locs.includes(filters.locationId!);
    });
  }
  const eligibleSet = new Set(eligible.map((p) => p.id));

  const currentMap = new Map(currentCounts.map((c) => [c.physicianId, c.count]));
  const priorMap = new Map(priorCounts.map((c) => [c.physicianId, c.count]));

  // Step 1: Find physicians with >20% decline (must have prior referrals)
  const declining: {
    physicianId: string;
    currentCount: number;
    priorCount: number;
    changePercent: number;
  }[] = [];

  for (const [physId, priorCount] of priorMap.entries()) {
    if (!physId || priorCount === 0 || !eligibleSet.has(physId)) continue;
    const currentCount = currentMap.get(physId) || 0;
    const changePercent = Math.round(
      ((currentCount - priorCount) / priorCount) * 100,
    );
    if (changePercent <= -20) {
      declining.push({ physicianId: physId, currentCount, priorCount, changePercent });
    }
  }

  // Step 2: Determine no-touchpoint and overdue-task sets
  const noTouchpointSet = new Set(
    eligible
      .filter(
        (p) =>
          declining.some((d) => d.physicianId === p.id) &&
          (!p.lastInteractionAt || p.lastInteractionAt < touchpointCutoff),
      )
      .map((p) => p.id),
  );

  const overdueSet = new Set(
    taskList
      .filter(
        (t) =>
          t.status === "OPEN" &&
          t.dueAt < now &&
          declining.some((d) => d.physicianId === t.physicianId),
      )
      .map((t) => t.physicianId),
  );

  // Step 3: Intersect decline with (no-touchpoint OR overdue-task)
  const atRisk = declining.filter(
    (d) => noTouchpointSet.has(d.physicianId) || overdueSet.has(d.physicianId),
  );

  const physMap = new Map(eligible.map((p) => [p.id, p]));

  return atRisk
    .map((d) => {
      const phys = physMap.get(d.physicianId);
      return {
        ...d,
        physician: phys || null,
        riskSignal: noTouchpointSet.has(d.physicianId)
          ? "no_contact"
          : "overdue_task",
        daysSinceContact: (() => {
          if (!phys?.lastInteractionAt) return null;
          return Math.floor(
            (now.getTime() - phys.lastInteractionAt.getTime()) /
              (1000 * 60 * 60 * 24),
          );
        })(),
      };
    })
    .filter((d) => d.physician !== null)
    .sort((a, b) => a.changePercent - b.changePercent);
}

// ---- Test fixtures ----

const NOW = new Date("2026-02-27T12:00:00Z");
const DAYS_AGO = (n: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d;
};

function makePhysician(
  overrides: Partial<PhysicianInfo> & { id: string },
): PhysicianInfo {
  return {
    firstName: "John",
    lastName: "Doe",
    practiceName: "Test Practice",
    lastInteractionAt: null,
    territoryId: null,
    deletedAt: null,
    ...overrides,
  };
}

// ---- Tests ----

describe("At-Risk Referral Sources Computation", () => {
  it("includes physician with >20% decline + no touchpoint in 30d", () => {
    const physicians = [makePhysician({ id: "p1", lastInteractionAt: DAYS_AGO(45) })];
    const prior: ReferralCount[] = [{ physicianId: "p1", count: 10 }];
    const current: ReferralCount[] = [{ physicianId: "p1", count: 5 }];

    const result = computeAtRiskSources(current, prior, physicians, [], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].physicianId).toBe("p1");
    expect(result[0].changePercent).toBe(-50);
    expect(result[0].riskSignal).toBe("no_contact");
  });

  it("includes physician with >20% decline + overdue task", () => {
    const physicians = [
      makePhysician({ id: "p1", lastInteractionAt: DAYS_AGO(5) }),
    ];
    const prior: ReferralCount[] = [{ physicianId: "p1", count: 10 }];
    const current: ReferralCount[] = [{ physicianId: "p1", count: 7 }];
    const tasks: TaskInfo[] = [
      { physicianId: "p1", status: "OPEN", dueAt: DAYS_AGO(3) },
    ];

    const result = computeAtRiskSources(current, prior, physicians, tasks, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].riskSignal).toBe("overdue_task");
  });

  it("excludes physician with >20% decline but recent touchpoint and no overdue task", () => {
    const physicians = [
      makePhysician({ id: "p1", lastInteractionAt: DAYS_AGO(10) }),
    ];
    const prior: ReferralCount[] = [{ physicianId: "p1", count: 10 }];
    const current: ReferralCount[] = [{ physicianId: "p1", count: 5 }];

    const result = computeAtRiskSources(current, prior, physicians, [], NOW);
    expect(result).toHaveLength(0);
  });

  it("excludes physician with <20% decline", () => {
    const physicians = [makePhysician({ id: "p1", lastInteractionAt: null })];
    const prior: ReferralCount[] = [{ physicianId: "p1", count: 10 }];
    const current: ReferralCount[] = [{ physicianId: "p1", count: 9 }];

    const result = computeAtRiskSources(current, prior, physicians, [], NOW);
    expect(result).toHaveLength(0);
  });

  it("excludes new physician with no prior referrals", () => {
    const physicians = [makePhysician({ id: "p1", lastInteractionAt: null })];
    const prior: ReferralCount[] = [];
    const current: ReferralCount[] = [{ physicianId: "p1", count: 3 }];

    const result = computeAtRiskSources(current, prior, physicians, [], NOW);
    expect(result).toHaveLength(0);
  });

  it("excludes soft-deleted physician", () => {
    const physicians = [
      makePhysician({ id: "p1", lastInteractionAt: null, deletedAt: DAYS_AGO(2) }),
    ];
    const prior: ReferralCount[] = [{ physicianId: "p1", count: 10 }];
    const current: ReferralCount[] = [{ physicianId: "p1", count: 2 }];

    const result = computeAtRiskSources(current, prior, physicians, [], NOW);
    expect(result).toHaveLength(0);
  });

  it("filters by territoryId correctly", () => {
    const physicians = [
      makePhysician({ id: "p1", lastInteractionAt: null, territoryId: "t1" }),
      makePhysician({ id: "p2", lastInteractionAt: null, territoryId: "t2" }),
    ];
    const prior: ReferralCount[] = [
      { physicianId: "p1", count: 10 },
      { physicianId: "p2", count: 10 },
    ];
    const current: ReferralCount[] = [
      { physicianId: "p1", count: 3 },
      { physicianId: "p2", count: 3 },
    ];

    const result = computeAtRiskSources(current, prior, physicians, [], NOW, {
      territoryId: "t1",
    });
    expect(result).toHaveLength(1);
    expect(result[0].physicianId).toBe("p1");
  });

  it("filters by locationId correctly", () => {
    const physicians = [
      makePhysician({ id: "p1", lastInteractionAt: null }),
      makePhysician({ id: "p2", lastInteractionAt: null }),
    ];
    const prior: ReferralCount[] = [
      { physicianId: "p1", count: 10 },
      { physicianId: "p2", count: 10 },
    ];
    const current: ReferralCount[] = [
      { physicianId: "p1", count: 3 },
      { physicianId: "p2", count: 3 },
    ];
    const locationMap = new Map([
      ["p1", ["loc1"]],
      ["p2", ["loc2"]],
    ]);

    const result = computeAtRiskSources(
      current, prior, physicians, [], NOW,
      { locationId: "loc1" },
      locationMap,
    );
    expect(result).toHaveLength(1);
    expect(result[0].physicianId).toBe("p1");
  });

  it("sorts by changePercent ascending (most at-risk first)", () => {
    const physicians = [
      makePhysician({ id: "p1", lastInteractionAt: null }),
      makePhysician({ id: "p2", lastInteractionAt: null }),
    ];
    const prior: ReferralCount[] = [
      { physicianId: "p1", count: 10 },
      { physicianId: "p2", count: 10 },
    ];
    const current: ReferralCount[] = [
      { physicianId: "p1", count: 7 },
      { physicianId: "p2", count: 2 },
    ];

    const result = computeAtRiskSources(current, prior, physicians, [], NOW);
    expect(result).toHaveLength(2);
    expect(result[0].physicianId).toBe("p2");
    expect(result[1].physicianId).toBe("p1");
  });
});
