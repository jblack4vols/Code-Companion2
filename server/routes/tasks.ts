import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { insertTaskSchema } from "@shared/schema";
import { requireAuth, requireRole } from "./shared";
import { sendTaskAssignmentEmail } from "../outlook";

export function registerTaskRoutes(app: Express) {
  app.get("/api/tasks", requireAuth, async (req, res) => {
    const physicianId = req.query.physicianId as string | undefined;
    res.json(await storage.getTasks(physicianId));
  });

  app.post("/api/tasks", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const body = { ...req.body };
      if (typeof body.dueAt === "string") body.dueAt = new Date(body.dueAt);
      const validated = insertTaskSchema.parse(body);
      const task = await storage.createTask(validated);

      if (task.assignedToUserId && task.assignedToUserId !== req.session.userId) {
        const assignedUser = await storage.getUser(task.assignedToUserId);
        const currentUser = await storage.getUser(req.session.userId!);
        if (assignedUser?.email && currentUser) {
          let providerName: string | null = null;
          if (task.physicianId) {
            const phys = await storage.getPhysician(task.physicianId);
            if (phys) providerName = `${phys.firstName} ${phys.lastName}`;
          }
          const appUrl = `${req.protocol}://${req.get('host')}`;
          sendTaskAssignmentEmail(
            assignedUser.email,
            assignedUser.name,
            task.description.slice(0, 100),
            task.description || null,
            task.dueAt?.toISOString() || null,
            currentUser.name,
            providerName,
            appUrl
          ).catch(() => {});
        }
      }

      res.json(task);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getTask(req.params.id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const user = await storage.getUser(req.session.userId!);
      if (user && user.role !== "OWNER" && user.role !== "DIRECTOR" && existing.assignedToUserId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden: you can only edit tasks assigned to you" });
      }
      const body = { ...req.body };
      if (typeof body.dueAt === "string") body.dueAt = new Date(body.dueAt);
      const validated = insertTaskSchema.partial().extend({ status: z.enum(["OPEN", "DONE"]).optional() }).parse(body);
      const task = await storage.updateTask(req.params.id, validated);
      if (!task) return res.status(404).json({ message: "Not found" });
      res.json(task);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });
}
