import type { Express } from "express";
import { db } from "../db";
import { patientRequests, appointmentSlots, locations } from "@shared/schema";
import { requireRole, requireAuth } from "./shared";
import { eq, and, gte, asc, sql } from "drizzle-orm";
import { z } from "zod";

const EMERGENCY_PHRASES = [
  "chest pain", "stroke", "shortness of breath", "severe bleeding",
  "suicidal", "suicide", "heart attack", "unconscious", "not breathing",
  "seizure", "anaphylaxis", "severe allergic",
];

function triageClassify(symptoms: string): { level: "RED" | "ORANGE" | "YELLOW" | "GREEN"; notes: string } {
  const lower = symptoms.toLowerCase();

  for (const phrase of EMERGENCY_PHRASES) {
    if (lower.includes(phrase)) {
      return { level: "RED", notes: `Emergency detected: "${phrase}". Call 911 immediately. Do not schedule.` };
    }
  }

  const urgentPhrases = [
    "severe pain", "high fever", "fracture", "dislocation", "open wound",
    "head injury", "fall from height", "sudden weakness", "numbness",
    "post-surgical", "post-operative", "acute",
  ];
  for (const phrase of urgentPhrases) {
    if (lower.includes(phrase)) {
      return { level: "ORANGE", notes: `Urgent: "${phrase}" detected. Schedule within 24 hours.` };
    }
  }

  const moderatePhrases = [
    "persistent pain", "swelling", "limited range", "stiffness",
    "recurring", "worsening", "difficulty walking", "difficulty standing",
    "back pain", "neck pain", "shoulder pain", "knee pain",
  ];
  for (const phrase of moderatePhrases) {
    if (lower.includes(phrase)) {
      return { level: "YELLOW", notes: `Moderate: "${phrase}" detected. Schedule within 3-5 days.` };
    }
  }

  return { level: "GREEN", notes: "Routine intake. Schedule at next available slot." };
}

const createRequestSchema = z.object({
  patientName: z.string().min(1, "Patient name is required"),
  phone: z.string().min(7, "Valid phone number required"),
  symptoms: z.string().min(1, "Symptoms description is required"),
  locationPreference: z.string().optional().nullable(),
});

export function registerFrontDeskRoutes(app: Express) {
  const ACCESS = requireRole("OWNER", "DIRECTOR", "FRONT_DESK");

  app.get("/api/frontdesk/requests", ACCESS, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      let query = db.select().from(patientRequests).orderBy(asc(patientRequests.createdAt));

      if (status) {
        const results = await db.select().from(patientRequests)
          .where(eq(patientRequests.status, status as any))
          .orderBy(asc(patientRequests.createdAt));
        return res.json(results);
      }

      const results = await query;
      res.json(results);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/frontdesk/requests", ACCESS, async (req, res) => {
    try {
      const parsed = createRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten().fieldErrors });
      }

      const triage = triageClassify(parsed.data.symptoms);

      const [request] = await db.insert(patientRequests).values({
        patientName: parsed.data.patientName,
        phone: parsed.data.phone,
        symptoms: parsed.data.symptoms,
        locationPreference: parsed.data.locationPreference || null,
        triageLevel: triage.level,
        triageNotes: triage.notes,
        status: triage.level === "RED" ? "TRIAGED" : "TRIAGED",
        createdBy: req.session.userId || null,
      }).returning();

      res.json({ request, triage });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/frontdesk/triage", ACCESS, async (_req, res) => {
    try {
      const { symptoms } = _req.body;
      if (!symptoms || typeof symptoms !== "string") {
        return res.status(400).json({ message: "Symptoms text is required" });
      }
      const result = triageClassify(symptoms);
      res.json(result);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/frontdesk/slots", ACCESS, async (req, res) => {
    try {
      const locationId = (req.query.locationId ? String(req.query.locationId) : undefined);
      const dateFrom = (req.query.dateFrom ? String(req.query.dateFrom) : null) || new Date().toISOString().slice(0, 10);

      let conditions = [
        eq(appointmentSlots.isAvailable, true),
        gte(appointmentSlots.date, dateFrom),
      ];

      if (locationId) {
        conditions.push(eq(appointmentSlots.locationId, locationId));
      }

      const slots = await db.select({
        slot: appointmentSlots,
        locationName: locations.name,
      })
        .from(appointmentSlots)
        .leftJoin(locations, eq(appointmentSlots.locationId, locations.id))
        .where(and(...conditions))
        .orderBy(asc(appointmentSlots.date), asc(appointmentSlots.startTime))
        .limit(50);

      res.json(slots);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/frontdesk/schedule", ACCESS, async (req, res) => {
    try {
      const { requestId, slotId } = req.body;
      if (!requestId || !slotId) {
        return res.status(400).json({ message: "requestId and slotId are required" });
      }

      const [request] = await db.select().from(patientRequests).where(eq(patientRequests.id, requestId));
      if (!request) return res.status(404).json({ message: "Patient request not found" });
      if (request.triageLevel === "RED") {
        return res.status(400).json({ message: "Emergency (RED) triage patients cannot be scheduled. Call 911." });
      }

      const [slot] = await db.select().from(appointmentSlots).where(eq(appointmentSlots.id, slotId));
      if (!slot) return res.status(404).json({ message: "Appointment slot not found" });
      if (!slot.isAvailable) return res.status(400).json({ message: "Slot is no longer available" });

      await db.update(appointmentSlots).set({
        isAvailable: false,
        patientRequestId: requestId,
      }).where(eq(appointmentSlots.id, slotId));

      const [updated] = await db.update(patientRequests).set({
        status: "SCHEDULED",
        appointmentSlotId: slotId,
        updatedAt: new Date(),
      }).where(eq(patientRequests.id, requestId)).returning();

      res.json({ request: updated, slot });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/frontdesk/waitlist", ACCESS, async (req, res) => {
    try {
      const { requestId } = req.body;
      if (!requestId) return res.status(400).json({ message: "requestId is required" });

      const [updated] = await db.update(patientRequests).set({
        status: "WAITLISTED",
        updatedAt: new Date(),
      }).where(eq(patientRequests.id, requestId)).returning();

      if (!updated) return res.status(404).json({ message: "Patient request not found" });
      res.json(updated);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/frontdesk/requests/:id/cancel", ACCESS, async (req, res) => {
    try {
      const requestId = String(req.params.id);
      const [existing] = await db.select().from(patientRequests).where(eq(patientRequests.id, requestId));
      if (!existing) return res.status(404).json({ message: "Not found" });

      if (existing.appointmentSlotId) {
        await db.update(appointmentSlots).set({
          isAvailable: true,
          patientRequestId: null,
        }).where(eq(appointmentSlots.id, existing.appointmentSlotId));
      }

      const [updated] = await db.update(patientRequests).set({
        status: "CANCELLED",
        updatedAt: new Date(),
      }).where(eq(patientRequests.id, requestId)).returning();

      res.json(updated);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/frontdesk/stats", ACCESS, async (_req, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10);

      const requestResult = await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'NEW') as new_count,
          COUNT(*) FILTER (WHERE status = 'TRIAGED') as triaged_count,
          COUNT(*) FILTER (WHERE status = 'SCHEDULED') as scheduled_count,
          COUNT(*) FILTER (WHERE status = 'WAITLISTED') as waitlisted_count,
          COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_count,
          COUNT(*) FILTER (WHERE triage_level = 'RED') as red_count,
          COUNT(*) FILTER (WHERE triage_level = 'ORANGE') as orange_count,
          COUNT(*) FILTER (WHERE triage_level = 'YELLOW') as yellow_count,
          COUNT(*) FILTER (WHERE triage_level = 'GREEN') as green_count,
          COUNT(*) as total
        FROM patient_requests
        WHERE created_at >= CURRENT_DATE
      `);
      const requestStats = (requestResult.rows as any[])[0] || {};

      const slotResult = await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE is_available = true AND date >= ${today}) as available_slots,
          COUNT(*) FILTER (WHERE is_available = false AND date >= ${today}) as booked_slots
        FROM appointment_slots
      `);
      const slotStats = (slotResult.rows as any[])[0] || {};

      res.json({ requests: requestStats, slots: slotStats });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/frontdesk/seed-slots", requireRole("OWNER", "DIRECTOR"), async (_req, res) => {
    try {
      const locs = await db.select().from(locations).where(eq(locations.isActive, true));
      if (locs.length === 0) return res.status(400).json({ message: "No active locations found" });

      const timeSlots = [
        { start: "08:00", end: "08:45" },
        { start: "09:00", end: "09:45" },
        { start: "10:00", end: "10:45" },
        { start: "11:00", end: "11:45" },
        { start: "13:00", end: "13:45" },
        { start: "14:00", end: "14:45" },
        { start: "15:00", end: "15:45" },
        { start: "16:00", end: "16:45" },
      ];

      const today = new Date();
      const slotsToInsert = [];

      for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
        const d = new Date(today);
        d.setDate(d.getDate() + dayOffset);
        if (d.getDay() === 0 || d.getDay() === 6) continue;
        const dateStr = d.toISOString().slice(0, 10);

        for (const loc of locs) {
          for (const ts of timeSlots) {
            slotsToInsert.push({
              locationId: loc.id,
              date: dateStr,
              startTime: ts.start,
              endTime: ts.end,
              isAvailable: true,
            });
          }
        }
      }

      if (slotsToInsert.length > 0) {
        for (let i = 0; i < slotsToInsert.length; i += 100) {
          await db.insert(appointmentSlots).values(slotsToInsert.slice(i, i + 100));
        }
      }

      res.json({ message: `Seeded ${slotsToInsert.length} appointment slots across ${locs.length} locations for 14 days` });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
