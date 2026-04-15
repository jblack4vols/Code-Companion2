import type { Express } from "express";
import { z } from "zod";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { feedbackItems, feedbackNotes, users } from "@shared/schema";
import { requireAuth } from "./shared";
import { storage } from "../storage";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const VALID_CATEGORIES = ["FEATURE_IDEA", "BUG", "IMPROVEMENT", "OTHER"] as const;
const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const VALID_STATUSES = ["OPEN", "IN_REVIEW", "PLANNED", "IN_PROGRESS", "COMPLETED", "CLOSED"] as const;

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "application/pdf": ".pdf",
};
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const UPLOAD_DIR = process.env.VERCEL ? path.join("/tmp", "uploads/feedback") : path.resolve("uploads/feedback");

try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch { /* read-only fs */ }

const createFeedbackSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().min(1, "Description is required").max(5000),
  category: z.enum(VALID_CATEGORIES),
  priority: z.enum(VALID_PRIORITIES).default("MEDIUM"),
});

const updateFeedbackSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().min(1).max(5000).optional(),
  category: z.enum(VALID_CATEGORIES).optional(),
  priority: z.enum(VALID_PRIORITIES).optional(),
  status: z.enum(VALID_STATUSES).optional(),
  assignedTo: z.string().nullable().optional(),
});

const createNoteSchema = z.object({
  content: z.string().min(1, "Content is required").max(5000),
});

export function registerFeedbackRoutes(app: Express) {
  app.use("/api/feedback/attachments", requireAuth, (req, res, next) => {
    const basename = path.basename(req.path);
    if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(basename)) {
      return res.status(400).json({ message: "Invalid filename" });
    }
    const filePath = path.join(UPLOAD_DIR, basename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });

    const ext = path.extname(basename).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".jpg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
      ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
      ".pdf": "application/pdf",
    };
    const contentType = mimeMap[ext] || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) {
      res.setHeader("Content-Disposition", `attachment; filename="${basename}"`);
    }
    res.sendFile(filePath);
  });

  app.get("/api/feedback", requireAuth, async (req, res) => {
    try {
      const items = await db
        .select({
          id: feedbackItems.id,
          title: feedbackItems.title,
          description: feedbackItems.description,
          category: feedbackItems.category,
          priority: feedbackItems.priority,
          status: feedbackItems.status,
          attachments: feedbackItems.attachments,
          submittedBy: feedbackItems.submittedBy,
          assignedTo: feedbackItems.assignedTo,
          createdAt: feedbackItems.createdAt,
          updatedAt: feedbackItems.updatedAt,
          submittedByName: users.name,
        })
        .from(feedbackItems)
        .leftJoin(users, eq(feedbackItems.submittedBy, users.id))
        .orderBy(desc(feedbackItems.createdAt));

      const allUsers = await db.select({ id: users.id, name: users.name }).from(users);
      const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

      const enriched = items.map((item) => ({
        ...item,
        assignedToName: item.assignedTo ? userMap.get(item.assignedTo) || null : null,
      }));

      res.json(enriched);
    } catch (err: any) {
      console.error("[Feedback] GET /api/feedback error:", err);
      res.status(500).json({ message: "Failed to fetch feedback items" });
    }
  });

  app.get("/api/feedback/:id", requireAuth, async (req, res) => {
    try {
      const feedbackId = String(req.params.id);
      const [item] = await db
        .select()
        .from(feedbackItems)
        .where(eq(feedbackItems.id, feedbackId));
      if (!item) return res.status(404).json({ message: "Not found" });

      const notes = await db
        .select({
          id: feedbackNotes.id,
          feedbackItemId: feedbackNotes.feedbackItemId,
          userId: feedbackNotes.userId,
          content: feedbackNotes.content,
          createdAt: feedbackNotes.createdAt,
          userName: users.name,
        })
        .from(feedbackNotes)
        .leftJoin(users, eq(feedbackNotes.userId, users.id))
        .where(eq(feedbackNotes.feedbackItemId, feedbackId))
        .orderBy(desc(feedbackNotes.createdAt));

      const allUsers = await db.select({ id: users.id, name: users.name }).from(users);
      const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

      res.json({
        ...item,
        submittedByName: userMap.get(item.submittedBy) || "Unknown",
        assignedToName: item.assignedTo ? userMap.get(item.assignedTo) || null : null,
        notes,
      });
    } catch (err: any) {
      console.error("[Feedback] GET /api/feedback/:id error:", err);
      res.status(500).json({ message: "Failed to fetch feedback item" });
    }
  });

  app.post("/api/feedback", requireAuth, async (req, res) => {
    try {
      const multer = (await import("multer")).default;
      const upload = multer({
        storage: multer.diskStorage({
          destination: UPLOAD_DIR,
          filename: (_req, file, cb) => {
            const safeExt = ALLOWED_MIME_TYPES[file.mimetype] || ".bin";
            cb(null, `${crypto.randomUUID()}${safeExt}`);
          },
        }),
        limits: { fileSize: MAX_FILE_SIZE },
        fileFilter: (_req, file, cb) => {
          if (file.mimetype in ALLOWED_MIME_TYPES) {
            cb(null, true);
          } else {
            cb(new Error(`File type ${file.mimetype} not allowed. Accepted: images, videos, and PDFs.`));
          }
        },
      });

      upload.array("files", 5)(req, res, async (uploadErr) => {
        try {
          if (uploadErr) {
            return res.status(400).json({ message: uploadErr.message });
          }

          const parsed = createFeedbackSchema.safeParse(req.body);
          if (!parsed.success) {
            if (req.files && Array.isArray(req.files)) {
              for (const f of req.files) fs.unlinkSync(f.path);
            }
            return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten().fieldErrors });
          }

          const { title, description, category, priority } = parsed.data;

          const attachments = (req.files as Express.Multer.File[] || []).map((f) => ({
            filename: f.filename,
            originalName: f.originalname,
            mimeType: f.mimetype,
            size: f.size,
          }));

          let item;
          try {
            [item] = await db
              .insert(feedbackItems)
              .values({
                title,
                description,
                category,
                priority,
                attachments,
                submittedBy: req.session.userId!,
              })
              .returning();
          } catch (dbErr: any) {
            console.error("[Feedback] DB insert error:", dbErr);
            const uploadedFiles = req.files as Express.Multer.File[] || [];
            for (const f of uploadedFiles) {
              try { fs.unlinkSync(f.path); } catch {}
            }
            return res.status(500).json({ message: "Failed to create feedback item" });
          }

          try {
            await storage.createAuditLog({
              userId: req.session.userId!,
              action: "CREATE",
              entity: "feedback",
              entityId: item.id,
              detailJson: { title, category, attachmentCount: attachments.length },
            });
          } catch (auditErr) {
            console.error("[Feedback] Audit log error (non-fatal):", auditErr);
          }

          res.status(201).json(item);
        } catch (err: any) {
          console.error("[Feedback] POST /api/feedback error:", err);
          const uploadedFiles = (req.files as Express.Multer.File[]) || [];
          for (const f of uploadedFiles) {
            try { fs.unlinkSync(f.path); } catch {}
          }
          res.status(500).json({ message: "Failed to create feedback item" });
        }
      });
    } catch (err: any) {
      console.error("[Feedback] POST /api/feedback error:", err);
      res.status(500).json({ message: "Failed to create feedback item" });
    }
  });

  app.patch("/api/feedback/:id", requireAuth, async (req, res) => {
    try {
      const parsed = updateFeedbackSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten().fieldErrors });
      }

      const feedbackId = String(req.params.id);
      const [existing] = await db
        .select()
        .from(feedbackItems)
        .where(eq(feedbackItems.id, feedbackId));
      if (!existing) return res.status(404).json({ message: "Not found" });

      const user = await storage.getUser(req.session.userId!);
      const isOwnerOrDirector = user?.role === "OWNER" || user?.role === "DIRECTOR";
      const isSubmitter = existing.submittedBy === req.session.userId;

      if (!isOwnerOrDirector && !isSubmitter) {
        return res.status(403).json({ message: "Only the submitter or managers can update this item" });
      }

      const { title, description, category, priority, status, assignedTo } = parsed.data;

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (category !== undefined) updates.category = category;
      if (priority !== undefined) updates.priority = priority;

      if (status !== undefined) {
        if (!isOwnerOrDirector) {
          return res.status(403).json({ message: "Only managers can change the status" });
        }
        updates.status = status;
      }
      if (assignedTo !== undefined) {
        if (!isOwnerOrDirector) {
          return res.status(403).json({ message: "Only managers can change the assignee" });
        }
        updates.assignedTo = assignedTo || null;
      }

      const [updated] = await db
        .update(feedbackItems)
        .set(updates)
        .where(eq(feedbackItems.id, feedbackId))
        .returning();

      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "UPDATE",
        entity: "feedback",
        entityId: feedbackId,
        detailJson: updates,
      });

      res.json(updated);
    } catch (err: any) {
      console.error("[Feedback] PATCH /api/feedback/:id error:", err);
      res.status(500).json({ message: "Failed to update feedback item" });
    }
  });

  app.delete("/api/feedback/:id", requireAuth, async (req, res) => {
    try {
      const feedbackId = String(req.params.id);
      const [existing] = await db
        .select()
        .from(feedbackItems)
        .where(eq(feedbackItems.id, feedbackId));
      if (!existing) return res.status(404).json({ message: "Not found" });

      const user = await storage.getUser(req.session.userId!);
      const isOwnerOrDirector = user?.role === "OWNER" || user?.role === "DIRECTOR";
      const isSubmitter = existing.submittedBy === req.session.userId;

      if (!isOwnerOrDirector && !isSubmitter) {
        return res.status(403).json({ message: "Only the submitter or managers can delete this item" });
      }

      const attachments = (existing.attachments as any[]) || [];
      for (const att of attachments) {
        const filePath = path.join(UPLOAD_DIR, att.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }

      await db.delete(feedbackNotes).where(eq(feedbackNotes.feedbackItemId, feedbackId));
      await db.delete(feedbackItems).where(eq(feedbackItems.id, feedbackId));

      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "DELETE",
        entity: "feedback",
        entityId: feedbackId,
        detailJson: { title: existing.title },
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error("[Feedback] DELETE /api/feedback/:id error:", err);
      res.status(500).json({ message: "Failed to delete feedback item" });
    }
  });

  app.post("/api/feedback/:id/notes", requireAuth, async (req, res) => {
    try {
      const feedbackId = String(req.params.id);
      const parsed = createNoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten().fieldErrors });
      }

      const [existing] = await db
        .select()
        .from(feedbackItems)
        .where(eq(feedbackItems.id, feedbackId));
      if (!existing) return res.status(404).json({ message: "Feedback item not found" });

      const [note] = await db
        .insert(feedbackNotes)
        .values({
          feedbackItemId: feedbackId,
          userId: req.session.userId!,
          content: parsed.data.content,
        })
        .returning();

      await db
        .update(feedbackItems)
        .set({ updatedAt: new Date() })
        .where(eq(feedbackItems.id, feedbackId));

      const user = await storage.getUser(req.session.userId!);

      res.status(201).json({ ...note, userName: user?.name || "Unknown" });
    } catch (err: any) {
      console.error("[Feedback] POST /api/feedback/:id/notes error:", err);
      res.status(500).json({ message: "Failed to add note" });
    }
  });
}
