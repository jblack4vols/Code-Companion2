/**
 * Shared user helpers — safe user serialization and audit log shortcuts.
 * Eliminates repeated destructure + audit boilerplate across route files.
 */
import type { Request } from "express";
import type { User } from "@shared/schema";
import { storage } from "../storage";
import { getClientIp } from "../routes/shared";

/** Strip sensitive fields from a user object for API responses */
export function toSafeUser(user: User) {
  const { password: _, passwordResetToken: _t, passwordResetExpires: _e, ...safe } = user;
  return safe;
}

/** Shorthand audit log that auto-extracts IP + user-agent from the request */
export async function auditLog(
  req: Request,
  params: {
    userId: string | null;
    action: string;
    entity: string;
    entityId: string;
    detail?: Record<string, unknown>;
  },
) {
  await storage.createAuditLog({
    userId: params.userId,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId,
    detailJson: params.detail ?? {},
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] || null,
  });
}
