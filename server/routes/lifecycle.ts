/**
 * Patient Lifecycle Funnel routes.
 * GET /api/lifecycle/funnel — conversion, attendance, discharge metrics by location.
 * Roles: OWNER, DIRECTOR, ANALYST.
 */
import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireRole, getUserLocationScope } from "./shared";

/** Alert thresholds */
const CONVERSION_ALERT = 70;
const BEAN_STATION_CONVERSION_ALERT = 75;
const ARRIVAL_CRITICAL = 78;
const VISITS_PER_CASE_ALERT = 8;
const DROPOUT_ALERT_PCT = 20;

export function registerLifecycleRoutes(app: Express) {
  app.get(
    "/api/lifecycle/funnel",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const locationScope = await getUserLocationScope(req);
        if (locationScope !== null && locationScope.length === 0) {
          return res.json({ dateRange: { from: "", to: "" }, conversion: { total: 0, scheduled: 0, evalCompleted: 0, conversionRate: 0, byLocation: [] }, attendance: { totalScheduled: 0, totalArrived: 0, arrivalRate: 0, avgVisitsPerCase: 0, byLocation: [] }, discharge: { totalDischarged: 0, byReason: {}, completionRate: 0, byLocation: [] } });
        }

        const dateFrom = (req.query.dateFrom as string) || `${new Date().getFullYear()}-01-01`;
        const dateTo = (req.query.dateTo as string) || new Date().toISOString().slice(0, 10);
        const locationId = req.query.locationId as string | undefined;

        const locFilter = locationId && locationId !== "all"
          ? sql`AND r.location_id = ${locationId}`
          : locationScope !== null
            ? sql`AND r.location_id = ANY(${locationScope})`
            : sql``;

        const rows = await db.execute(sql`
          SELECT
            l.id AS location_id,
            l.name AS location_name,
            COUNT(*) FILTER (WHERE r.referral_date >= ${dateFrom} AND r.referral_date <= ${dateTo})::int AS total_cases,
            COUNT(*) FILTER (WHERE r.referral_date >= ${dateFrom} AND r.referral_date <= ${dateTo}
              AND r.status IN ('SCHEDULED', 'EVAL_COMPLETED', 'DISCHARGED'))::int AS scheduled_cases,
            COUNT(*) FILTER (WHERE r.referral_date >= ${dateFrom} AND r.referral_date <= ${dateTo}
              AND r.status IN ('EVAL_COMPLETED', 'DISCHARGED'))::int AS eval_completed_cases,
            COALESCE(SUM(r.scheduled_visits) FILTER (WHERE r.referral_date >= ${dateFrom} AND r.referral_date <= ${dateTo}), 0)::int AS total_scheduled_visits,
            COALESCE(SUM(r.arrived_visits) FILTER (WHERE r.referral_date >= ${dateFrom} AND r.referral_date <= ${dateTo}), 0)::int AS total_arrived_visits,
            COUNT(*) FILTER (WHERE r.referral_date >= ${dateFrom} AND r.referral_date <= ${dateTo}
              AND r.arrived_visits > 0)::int AS cases_with_visits,
            COUNT(*) FILTER (WHERE r.status = 'DISCHARGED'
              AND r.discharge_date >= ${dateFrom} AND r.discharge_date <= ${dateTo})::int AS total_discharged,
            COUNT(*) FILTER (WHERE r.status = 'DISCHARGED'
              AND r.discharge_date >= ${dateFrom} AND r.discharge_date <= ${dateTo}
              AND r.discharge_reason = 'COMPLETED')::int AS discharged_completed,
            COUNT(*) FILTER (WHERE r.status = 'DISCHARGED'
              AND r.discharge_date >= ${dateFrom} AND r.discharge_date <= ${dateTo}
              AND r.discharge_reason = 'PLATEAU')::int AS discharged_plateau,
            COUNT(*) FILTER (WHERE r.status = 'DISCHARGED'
              AND r.discharge_date >= ${dateFrom} AND r.discharge_date <= ${dateTo}
              AND r.discharge_reason = 'INSURANCE_DENIAL')::int AS discharged_insurance,
            COUNT(*) FILTER (WHERE r.status = 'DISCHARGED'
              AND r.discharge_date >= ${dateFrom} AND r.discharge_date <= ${dateTo}
              AND r.discharge_reason = 'PATIENT_REQUEST')::int AS discharged_patient_request,
            COUNT(*) FILTER (WHERE r.status = 'DISCHARGED'
              AND r.discharge_date >= ${dateFrom} AND r.discharge_date <= ${dateTo}
              AND r.discharge_reason = 'LOST_TO_FOLLOWUP')::int AS discharged_lost,
            COUNT(*) FILTER (WHERE r.status = 'DISCHARGED'
              AND r.discharge_date >= ${dateFrom} AND r.discharge_date <= ${dateTo}
              AND r.discharge_reason = 'MOVED')::int AS discharged_moved,
            COUNT(*) FILTER (WHERE r.status = 'DISCHARGED'
              AND r.discharge_date >= ${dateFrom} AND r.discharge_date <= ${dateTo}
              AND r.discharge_reason = 'FINANCIAL')::int AS discharged_financial
          FROM locations l
          LEFT JOIN referrals r ON r.location_id = l.id AND r.deleted_at IS NULL ${locFilter}
          WHERE l.is_active = true
          GROUP BY l.id, l.name
          ORDER BY l.name
        `);

        const locationRows = rows.rows as any[];

        let totalCases = 0, totalScheduled = 0, totalEvalCompleted = 0;
        let totalSchedVisits = 0, totalArrivedVisits = 0, totalCasesWithVisits = 0;
        let totalDischarged = 0, totalCompleted = 0;

        const conversionByLoc: any[] = [];
        const attendanceByLoc: any[] = [];
        const dischargeByLoc: any[] = [];

        for (const r of locationRows) {
          const cases = r.total_cases ?? 0;
          const sched = r.scheduled_cases ?? 0;
          const evalComp = r.eval_completed_cases ?? 0;
          const convRate = cases > 0 ? Math.round((evalComp / cases) * 1000) / 10 : 0;
          const isBeanStation = r.location_name?.toLowerCase().includes("bean station");
          const alertThreshold = isBeanStation ? BEAN_STATION_CONVERSION_ALERT : CONVERSION_ALERT;

          totalCases += cases;
          totalScheduled += sched;
          totalEvalCompleted += evalComp;

          conversionByLoc.push({
            locationId: r.location_id,
            locationName: r.location_name,
            total: cases,
            evalCompleted: evalComp,
            conversionRate: convRate,
            alert: cases > 0 && convRate < alertThreshold,
          });

          const sv = r.total_scheduled_visits ?? 0;
          const av = r.total_arrived_visits ?? 0;
          const cwv = r.cases_with_visits ?? 0;
          const arrRate = sv > 0 ? Math.round((av / sv) * 1000) / 10 : 0;
          const avgVpc = cwv > 0 ? Math.round((av / cwv) * 10) / 10 : 0;

          totalSchedVisits += sv;
          totalArrivedVisits += av;
          totalCasesWithVisits += cwv;

          attendanceByLoc.push({
            locationId: r.location_id,
            locationName: r.location_name,
            scheduled: sv,
            arrived: av,
            arrivalRate: arrRate,
            avgVisitsPerCase: avgVpc,
            arrivalAlert: sv > 0 && arrRate < ARRIVAL_CRITICAL,
            visitsPerCaseAlert: cwv > 0 && avgVpc < VISITS_PER_CASE_ALERT,
          });

          const disc = r.total_discharged ?? 0;
          const comp = r.discharged_completed ?? 0;
          const patReq = r.discharged_patient_request ?? 0;
          const lost = r.discharged_lost ?? 0;
          const byReason: Record<string, number> = {};
          if (comp > 0) byReason.COMPLETED = comp;
          if ((r.discharged_plateau ?? 0) > 0) byReason.PLATEAU = r.discharged_plateau;
          if ((r.discharged_insurance ?? 0) > 0) byReason.INSURANCE_DENIAL = r.discharged_insurance;
          if (patReq > 0) byReason.PATIENT_REQUEST = patReq;
          if (lost > 0) byReason.LOST_TO_FOLLOWUP = lost;
          if ((r.discharged_moved ?? 0) > 0) byReason.MOVED = r.discharged_moved;
          if ((r.discharged_financial ?? 0) > 0) byReason.FINANCIAL = r.discharged_financial;
          const dropoutPct = disc > 0 ? ((patReq + lost) / disc) * 100 : 0;

          totalDischarged += disc;
          totalCompleted += comp;

          dischargeByLoc.push({
            locationId: r.location_id,
            locationName: r.location_name,
            totalDischarged: disc,
            byReason,
            dropoutAlert: disc > 0 && dropoutPct > DROPOUT_ALERT_PCT,
          });
        }

        const aggReasons: Record<string, number> = {};
        for (const d of dischargeByLoc) {
          for (const [reason, count] of Object.entries(d.byReason)) {
            aggReasons[reason] = (aggReasons[reason] || 0) + (count as number);
          }
        }

        const aggConvRate = totalCases > 0 ? Math.round((totalEvalCompleted / totalCases) * 1000) / 10 : 0;
        const aggArrRate = totalSchedVisits > 0 ? Math.round((totalArrivedVisits / totalSchedVisits) * 1000) / 10 : 0;
        const aggAvgVpc = totalCasesWithVisits > 0 ? Math.round((totalArrivedVisits / totalCasesWithVisits) * 10) / 10 : 0;
        const aggCompRate = totalDischarged > 0 ? Math.round((totalCompleted / totalDischarged) * 1000) / 10 : 0;

        res.json({
          dateRange: { from: dateFrom, to: dateTo },
          conversion: {
            total: totalCases,
            scheduled: totalScheduled,
            evalCompleted: totalEvalCompleted,
            conversionRate: aggConvRate,
            byLocation: conversionByLoc.filter(l => l.total > 0).sort((a, b) => a.conversionRate - b.conversionRate),
          },
          attendance: {
            totalScheduled: totalSchedVisits,
            totalArrived: totalArrivedVisits,
            arrivalRate: aggArrRate,
            avgVisitsPerCase: aggAvgVpc,
            byLocation: attendanceByLoc.filter(l => l.scheduled > 0).sort((a, b) => a.arrivalRate - b.arrivalRate),
          },
          discharge: {
            totalDischarged,
            byReason: aggReasons,
            completionRate: aggCompRate,
            byLocation: dischargeByLoc.filter(l => l.totalDischarged > 0).sort((a, b) => {
              const aDropout = ((a.byReason.PATIENT_REQUEST || 0) + (a.byReason.LOST_TO_FOLLOWUP || 0)) / (a.totalDischarged || 1);
              const bDropout = ((b.byReason.PATIENT_REQUEST || 0) + (b.byReason.LOST_TO_FOLLOWUP || 0)) / (b.totalDischarged || 1);
              return bDropout - aDropout;
            }),
          },
        });
      } catch (err: any) {
        console.error("[lifecycle]", err);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );
}
