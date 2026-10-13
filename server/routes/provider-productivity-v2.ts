/**
 * Provider Productivity v2 API route.
 * GET /api/provider-productivity/v2
 * Roles: OWNER, DIRECTOR, ANALYST
 *
 * Derives VPD, UPV, status, root cause, coaching notes, trend, and revenue gap
 * from providerProductivity joined with users and locations.
 * Returns { summary, locations } matching PortedProviderResponse shape.
 */
import type { Express } from "express";
import { db } from "../db";
import { providerProductivity, users, locations } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";
import { requireRole, getUserLocationScope } from "./shared";

// KPI constants (mirrored from src/types/providers.ts)
const VPD_TARGET = 10;
const UPV_TARGET = 4.0;
const VPC_TARGET = 8;   // not stored in CRM schema; kept for future use
const RPV_TARGET = 95;
const VPD_NEAR_MIN = 8;
const UPV_NEAR_MIN = 3.5;

type ProviderStatus = "on_target" | "near_target" | "needs_coaching";
type RootCause =
  | "scheduling_fill_rate"
  | "cpt_undercapture"
  | "rushing_missing_units"
  | "both_kpis_low"
  | "visits_per_case_low";
type TrendDirection = "up" | "down" | "flat";

function deriveStatus(vpd: number, upv: number): ProviderStatus {
  if (vpd >= VPD_TARGET && upv >= UPV_TARGET) return "on_target";
  if (vpd >= VPD_NEAR_MIN && upv >= UPV_NEAR_MIN) return "near_target";
  return "needs_coaching";
}

function deriveRootCause(vpd: number, upv: number): RootCause | null {
  if (vpd >= VPD_TARGET && upv >= UPV_TARGET) return null;
  if (vpd < VPD_TARGET && upv >= UPV_TARGET) return "scheduling_fill_rate";
  if (vpd >= VPD_NEAR_MIN && upv < UPV_TARGET) return "cpt_undercapture";
  if (vpd >= VPD_TARGET && upv < UPV_NEAR_MIN) return "rushing_missing_units";
  return "both_kpis_low";
}

function buildCoachingNotes(vpd: number, upv: number): string[] {
  const notes: string[] = [];
  if (vpd < VPD_TARGET) {
    notes.push(
      `Visits/day ${vpd.toFixed(1)} vs ${VPD_TARGET} target — review schedule fill rate and cancellation recovery`
    );
  }
  if (upv < UPV_TARGET) {
    notes.push(
      `UPV ${upv.toFixed(1)} vs ${UPV_TARGET} target — check documentation for uncaptured timed codes`
    );
  }
  return notes;
}

function deriveTrendDirection(vpdHistory: number[]): TrendDirection {
  if (vpdHistory.length < 2) return "flat";
  const oldest = vpdHistory[0];
  const newest = vpdHistory[vpdHistory.length - 1];
  const delta = newest - oldest;
  if (delta > 0.3) return "up";
  if (delta < -0.3) return "down";
  return "flat";
}

interface ProviderRecord {
  providerName: string;
  providerRole: string;
  locationName: string;
  locationId: string;
  vpdCurrent: number;
  upvCurrent: number;
  daysWorked: number;
  weeklyRevGap: number;
  vpdTrendDirection: TrendDirection;
  status: ProviderStatus;
  rootCause: RootCause | null;
  coachingNotes: string[];
}

interface LocationRollup {
  location: string;
  providerCount: number;
  flaggedCount: number;
  avgVpd: number;
  avgUpv: number;
  status: ProviderStatus;
  providers: ProviderRecord[];
}

interface SummaryStats {
  avgVpd: number;
  avgUpv: number;
  totalWeeklyRevGap: number;
  flaggedProviderCount: number;
  totalProviders: number;
  providersAtTarget: number;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1);
}

export function registerProviderProductivityV2Routes(app: Express) {
  app.get(
    "/api/provider-productivity/v2",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const locationScope = await getUserLocationScope(req);
        if (locationScope !== null && locationScope.length === 0) {
          return res.json({ summary: buildEmptySummary(), locations: [] });
        }

        // Fetch last 4 weeks of records joined with user + location
        const rows = await db
          .select({
            userId: providerProductivity.userId,
            locationId: providerProductivity.locationId,
            weekStartDate: providerProductivity.weekStartDate,
            totalVisits: providerProductivity.totalVisits,
            totalUnits: providerProductivity.totalUnits,
            hoursWorked: providerProductivity.hoursWorked,
            revenueGenerated: providerProductivity.revenueGenerated,
            userName: users.name,
            userRole: users.role,
            locationName: locations.name,
          })
          .from(providerProductivity)
          .innerJoin(users, eq(providerProductivity.userId, users.id))
          .innerJoin(locations, eq(providerProductivity.locationId, locations.id))
          .orderBy(desc(providerProductivity.weekStartDate));

        // Apply location scope filter for non-admin roles
        const scoped = locationScope
          ? rows.filter((r) => locationScope.includes(r.locationId))
          : rows;

        // Group by provider key (userId + locationId)
        const providerMap = new Map<string, typeof scoped>();
        for (const row of scoped) {
          const key = `${row.userId}|${row.locationId}`;
          if (!providerMap.has(key)) providerMap.set(key, []);
          providerMap.get(key)!.push(row);
        }

        const providerRecords: ProviderRecord[] = [];

        for (const [, provRows] of Array.from(providerMap)) {
          // Sort ascending so index 0 = oldest
          const sorted = [...provRows].sort((a, b) =>
            String(a.weekStartDate).localeCompare(String(b.weekStartDate))
          );
          // Last 4 weeks max
          const last4 = sorted.slice(-4);
          const current = last4[last4.length - 1];

          const daysWorked = (current as Record<string, unknown>).daysWorked
            ? Number((current as Record<string, unknown>).daysWorked)
            : current.hoursWorked
              ? Math.max(1, Math.round((current.hoursWorked ?? 0) / 8))
              : 5;

          const vpdCurrent = current.totalVisits / daysWorked;
          const upvCurrent =
            current.totalVisits > 0
              ? current.totalUnits / current.totalVisits
              : 0;

          const vpdHistory = last4.map((r) => {
            const d = (r as Record<string, unknown>).daysWorked
              ? Number((r as Record<string, unknown>).daysWorked)
              : r.hoursWorked
                ? Math.max(1, Math.round((r.hoursWorked ?? 0) / 8))
                : 5;
            return r.totalVisits / d;
          });

          const status = deriveStatus(vpdCurrent, upvCurrent);
          const rootCause = deriveRootCause(vpdCurrent, upvCurrent);
          const coachingNotes =
            status !== "on_target"
              ? buildCoachingNotes(vpdCurrent, upvCurrent)
              : [];

          const weeklyRevGap = (vpdCurrent - VPD_TARGET) * daysWorked * RPV_TARGET;

          providerRecords.push({
            providerName: current.userName,
            providerRole: (current as Record<string, unknown>).providerType as string ?? current.userRole,
            locationName: current.locationName,
            locationId: current.locationId,
            vpdCurrent: +vpdCurrent.toFixed(1),
            upvCurrent: +upvCurrent.toFixed(2),
            daysWorked,
            weeklyRevGap: +weeklyRevGap.toFixed(2),
            vpdTrendDirection: deriveTrendDirection(vpdHistory),
            status,
            rootCause,
            coachingNotes,
          });
        }

        // Build location rollups grouped by locationId
        const locationMap = new Map<string, ProviderRecord[]>();
        for (const p of providerRecords) {
          if (!locationMap.has(p.locationId)) locationMap.set(p.locationId, []);
          locationMap.get(p.locationId)!.push(p);
        }

        const locationRollups: LocationRollup[] = [];
        for (const [, locProviders] of Array.from(locationMap)) {
          const sorted = [...locProviders].sort(
            (a, b) => b.vpdCurrent - a.vpdCurrent
          );
          const flagged = sorted.filter((p) => p.status === "needs_coaching");
          const nearTarget = sorted.filter((p) => p.status === "near_target");
          const locStatus: ProviderStatus =
            flagged.length > 0
              ? "needs_coaching"
              : nearTarget.length > 0
              ? "near_target"
              : "on_target";

          locationRollups.push({
            location: sorted[0].locationName,
            providerCount: sorted.length,
            flaggedCount: flagged.length,
            avgVpd: avg(sorted.map((p) => p.vpdCurrent)),
            avgUpv: avg(sorted.map((p) => p.upvCurrent)),
            status: locStatus,
            providers: sorted,
          });
        }

        // Sort locations by name
        locationRollups.sort((a, b) => a.location.localeCompare(b.location));

        // Build summary
        const allProviders = providerRecords;
        const summary: SummaryStats =
          allProviders.length === 0
            ? buildEmptySummary()
            : {
                avgVpd: avg(allProviders.map((p) => p.vpdCurrent)),
                avgUpv: avg(allProviders.map((p) => p.upvCurrent)),
                totalWeeklyRevGap: +allProviders
                  .reduce((s, p) => s + p.weeklyRevGap, 0)
                  .toFixed(2),
                flaggedProviderCount: allProviders.filter(
                  (p) => p.status === "needs_coaching"
                ).length,
                totalProviders: allProviders.length,
                providersAtTarget: allProviders.filter(
                  (p) => p.status === "on_target"
                ).length,
              };

        res.json({ summary, locations: locationRollups });
      } catch (err: any) {
        console.error("[provider-productivity-v2]", err);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );
}

function buildEmptySummary(): SummaryStats {
  return {
    avgVpd: 0,
    avgUpv: 0,
    totalWeeklyRevGap: 0,
    flaggedProviderCount: 0,
    totalProviders: 0,
    providersAtTarget: 0,
  };
}
