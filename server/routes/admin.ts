import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, lt } from "drizzle-orm";
import { appSettings, auditLogs, insertScheduledReportSchema } from "@shared/schema";
import { requireRole, getClientIp, qstr } from "./shared";

export function registerAdminRoutes(app: Express) {
  app.get("/api/audit-logs", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    const filters = {
      userId: req.query.userId as string | undefined,
      entity: req.query.entity as string | undefined,
      action: req.query.action as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };
    res.json(await storage.getAuditLogs(filters));
  });

  app.get("/api/settings/audit-retention", requireRole("OWNER"), async (req, res) => {
    try {
      const result = await db.select().from(appSettings).where(eq(appSettings.key, "audit_retention_days")).limit(1);
      res.json({ value: result[0]?.value || "365" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/settings/audit-retention", requireRole("OWNER"), async (req, res) => {
    try {
      const { days } = req.body;
      if (!days || days < 90) return res.status(400).json({ message: "Minimum retention is 90 days" });
      await db.insert(appSettings).values({ key: "audit_retention_days", value: String(days) })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: String(days), updatedAt: new Date() } });
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "Setting", entityId: "audit_retention_days", detailJson: { days }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/audit-logs/purge", requireRole("OWNER"), async (req, res) => {
    try {
      const result = await db.select().from(appSettings).where(eq(appSettings.key, "audit_retention_days")).limit(1);
      const retentionDays = parseInt(result[0]?.value || "365");
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const deleted = await db.delete(auditLogs).where(lt(auditLogs.timestamp, cutoffDate));
      await storage.createAuditLog({ userId: req.session.userId!, action: "PURGE", entity: "AuditLog", entityId: "bulk", detailJson: { retentionDays, cutoffDate: cutoffDate.toISOString() }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ deleted: deleted.rowCount || 0 });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/settings/etl-schedule", requireRole("OWNER"), async (req, res) => {
    try {
      const etlResult = await db.select().from(appSettings).where(eq(appSettings.key, "etl_schedule_time")).limit(1);
      const digestResult = await db.select().from(appSettings).where(eq(appSettings.key, "digest_schedule_time")).limit(1);
      const reportResult = await db.select().from(appSettings).where(eq(appSettings.key, "report_schedule_time")).limit(1);
      res.json({
        etlTime: etlResult[0]?.value || "2:00",
        digestTime: digestResult[0]?.value || "7:00",
        reportTime: reportResult[0]?.value || "6:30",
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/settings/etl-schedule", requireRole("OWNER"), async (req, res) => {
    try {
      const { etlTime, digestTime, reportTime } = req.body;
      const timeRegex = /^\d{1,2}:\d{2}$/;
      if (etlTime && !timeRegex.test(etlTime)) return res.status(400).json({ message: "Invalid ETL time format (HH:MM)" });
      if (digestTime && !timeRegex.test(digestTime)) return res.status(400).json({ message: "Invalid digest time format (HH:MM)" });
      if (reportTime && !timeRegex.test(reportTime)) return res.status(400).json({ message: "Invalid report time format (HH:MM)" });

      if (etlTime) {
        await db.insert(appSettings).values({ key: "etl_schedule_time", value: etlTime })
          .onConflictDoUpdate({ target: appSettings.key, set: { value: etlTime, updatedAt: new Date() } });
      }
      if (digestTime) {
        await db.insert(appSettings).values({ key: "digest_schedule_time", value: digestTime })
          .onConflictDoUpdate({ target: appSettings.key, set: { value: digestTime, updatedAt: new Date() } });
      }
      if (reportTime) {
        await db.insert(appSettings).values({ key: "report_schedule_time", value: reportTime })
          .onConflictDoUpdate({ target: appSettings.key, set: { value: reportTime, updatedAt: new Date() } });
      }

      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "Setting", entityId: "etl_schedule", detailJson: { etlTime, digestTime, reportTime }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });

      const { scheduleETL } = await import("../etl");
      await scheduleETL();

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/export/physicians", requireRole("OWNER", "DIRECTOR", "ANALYST"), async (req, res) => {
    try {
      const data = await storage.exportPhysiciansCsv({
        search: qstr(req.query.search as any),
        status: qstr(req.query.status as any),
        stage: qstr(req.query.stage as any),
        priority: qstr(req.query.priority as any),
        practiceName: qstr(req.query.practiceName as any),
      });
      const headers = ["First Name","Last Name","Credentials","Specialty","NPI","Practice","Address","City","State","Zip","Phone","Fax","Email","Status","Stage","Priority","Referrals"];
      const csv = [headers.join(","), ...data.map(r =>
        [r.firstName, r.lastName, r.credentials, r.specialty, r.npi, r.practiceName, r.address, r.city, r.state, r.zip, r.phone, r.fax, r.email, r.status, r.relationshipStage, r.priority, r.referralCount].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
      )].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="physicians_export_${new Date().toISOString().slice(0,10)}.csv"`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/export/referrals", requireRole("OWNER", "DIRECTOR", "ANALYST"), async (req, res) => {
    try {
      const data = await storage.exportReferralsCsv({
        search: qstr(req.query.search as any),
        status: qstr(req.query.status as any),
        locationId: qstr(req.query.locationId as any),
        discipline: qstr(req.query.discipline as any),
        dateFrom: qstr(req.query.dateFrom as any),
        dateTo: qstr(req.query.dateTo as any),
        physicianId: qstr(req.query.physicianId as any),
      });
      const headers = ["Referral Date","Patient Name","Account #","Case Title","Therapist","Discipline","Status","Insurance","Scheduled Visits","Arrived Visits","Initial Eval","Discharge Date","Discharge Reason","Referral Source","Provider First","Provider Last","Location"];
      const csv = [headers.join(","), ...data.map(r =>
        [r.referralDate, r.patientFullName, r.patientAccountNumber, r.caseTitle, r.caseTherapist, r.discipline, r.status, r.primaryInsurance, r.scheduledVisits, r.arrivedVisits, r.dateOfInitialEval, r.dischargeDate, r.dischargeReason, r.referralSource, r.physicianFirstName, r.physicianLastName, r.locationName].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
      )].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="referrals_export_${new Date().toISOString().slice(0,10)}.csv"`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/export/interactions", requireRole("OWNER", "DIRECTOR", "ANALYST"), async (req, res) => {
    try {
      const data = await storage.exportInteractionsCsv({
        physicianId: qstr(req.query.physicianId as any),
        type: qstr(req.query.type as any),
        dateFrom: qstr(req.query.dateFrom as any),
        dateTo: qstr(req.query.dateTo as any),
      });
      const headers = ["Date","Type","Summary","Next Step","Provider First","Provider Last","User","Location"];
      const csv = [headers.join(","), ...data.map(r =>
        [r.occurredAt ? new Date(r.occurredAt).toISOString().slice(0,10) : '', r.type, r.summary, r.nextStep, r.physicianFirstName, r.physicianLastName, r.userName, r.locationName].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
      )].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="interactions_export_${new Date().toISOString().slice(0,10)}.csv"`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/export/tasks", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const data = await storage.exportTasksCsv({
        status: qstr(req.query.status as any),
        assignedToUserId: qstr(req.query.assignedToUserId as any),
      });
      const headers = ["Description","Status","Priority","Due Date","Assigned To","Provider"];
      const csv = [headers.join(","), ...data.map(r =>
        [r.description, r.status, r.priority, r.dueDate ? new Date(r.dueDate).toISOString().slice(0,10) : '', r.assignedTo, [r.physicianFirstName, r.physicianLastName].filter(Boolean).join(' ')].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
      )].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="tasks_export_${new Date().toISOString().slice(0,10)}.csv"`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/export/audit-logs", requireRole("OWNER"), async (req, res) => {
    try {
      const data = await storage.exportAuditLogsCsv({
        entity: qstr(req.query.entity as any),
        action: qstr(req.query.action as any),
      });
      const headers = ["Timestamp","User","Action","Entity","Entity ID","IP Address","Details"];
      const csv = [headers.join(","), ...data.map(r =>
        [r.timestamp ? new Date(r.timestamp).toISOString() : '', r.userName, r.action, r.entity, r.entityId, r.ipAddress, JSON.stringify(r.detailJson || {})].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
      )].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="audit_logs_export_${new Date().toISOString().slice(0,10)}.csv"`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/scheduled-reports", requireRole("OWNER", "DIRECTOR"), async (_req, res) => {
    try {
      res.json(await storage.getScheduledReports());
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/scheduled-reports", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const validated = insertScheduledReportSchema.parse({
        ...req.body,
        createdBy: req.session.userId,
      });
      const report = await storage.createScheduledReport(validated);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "ScheduledReport", entityId: report.id, detailJson: { name: report.name }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(report);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/scheduled-reports/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const existing = await storage.getScheduledReport(req.params.id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const report = await storage.updateScheduledReport(req.params.id, req.body);
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "ScheduledReport", entityId: report.id, detailJson: req.body, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(report);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/scheduled-reports/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const existing = await storage.getScheduledReport(req.params.id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      await storage.deleteScheduledReport(req.params.id);
      await storage.createAuditLog({ userId: req.session.userId!, action: "DELETE", entity: "ScheduledReport", entityId: req.params.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/scheduled-reports/:id/run", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const report = await storage.getScheduledReport(req.params.id);
      if (!report) return res.status(404).json({ message: "Not found" });

      let csv = "";
      let filename = "";
      const dateStr = new Date().toISOString().slice(0, 10);

      if (report.reportType === "referral_summary") {
        const data = await storage.exportReferralsCsv({});
        const headers = ["Referral Date","Patient Name","Account #","Case Title","Therapist","Discipline","Status","Insurance","Scheduled Visits","Arrived Visits","Initial Eval","Discharge Date","Discharge Reason","Referral Source","Provider First","Provider Last","Location"];
        csv = [headers.join(","), ...data.map((r: any) =>
          [r.referralDate, r.patientFullName, r.patientAccountNumber, r.caseTitle, r.caseTherapist, r.discipline, r.status, r.primaryInsurance, r.scheduledVisits, r.arrivedVisits, r.dateOfInitialEval, r.dischargeDate, r.dischargeReason, r.referralSource, r.physicianFirstName, r.physicianLastName, r.locationName].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
        )].join("\n");
        filename = `referral_summary_${dateStr}.csv`;
      } else if (report.reportType === "interaction_summary") {
        const data = await storage.exportInteractionsCsv({});
        const headers = ["Date","Type","Summary","Next Step","Provider First","Provider Last","User","Location"];
        csv = [headers.join(","), ...data.map((r: any) =>
          [r.occurredAt ? new Date(r.occurredAt).toISOString().slice(0,10) : '', r.type, r.summary, r.nextStep, r.physicianFirstName, r.physicianLastName, r.userName, r.locationName].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
        )].join("\n");
        filename = `interaction_summary_${dateStr}.csv`;
      } else if (report.reportType === "provider_pipeline") {
        const data = await storage.exportPhysiciansCsv({});
        const headers = ["First Name","Last Name","Credentials","Specialty","NPI","Practice","Address","City","State","Zip","Phone","Fax","Email","Status","Stage","Priority","Referrals"];
        csv = [headers.join(","), ...data.map((r: any) =>
          [r.firstName, r.lastName, r.credentials, r.specialty, r.npi, r.practiceName, r.address, r.city, r.state, r.zip, r.phone, r.fax, r.email, r.status, r.relationshipStage, r.priority, r.referralCount].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
        )].join("\n");
        filename = `provider_pipeline_${dateStr}.csv`;
      } else {
        return res.status(400).json({ message: "Unknown report type" });
      }

      await storage.updateScheduledReport(report.id, { lastRunAt: new Date() } as any);
      await storage.createAuditLog({ userId: req.session.userId!, action: "RUN_REPORT", entity: "ScheduledReport", entityId: report.id, detailJson: { reportType: report.reportType }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
