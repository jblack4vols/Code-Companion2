import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

/**
 * Returns null for OWNER/DIRECTOR (bypass — see all locations).
 * Returns string[] of locationIds for scoped roles.
 * Empty array means user has no location assignments — see nothing.
 */
export async function getUserLocationScope(req: Request): Promise<string[] | null> {
  if (!req.session.userId) return [];
  const user = await storage.getUser(req.session.userId);
  if (!user) return [];
  if (user.role === "OWNER" || user.role === "DIRECTOR") return null;
  return storage.getUserLocationIds(req.session.userId);
}

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

export function qstr(val: unknown): string | undefined {
  if (Array.isArray(val)) return typeof val[0] === "string" ? val[0] : undefined;
  return typeof val === "string" ? val : undefined;
}

export function qstrReq(val: unknown): string {
  if (Array.isArray(val)) return typeof val[0] === "string" ? val[0] : "";
  return typeof val === "string" ? val : "";
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    if (user.role === "OWNER") return next();
    if (!roles.includes(user.role)) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}

export const MAX_LOGIN_ATTEMPTS = 10;
export const LOCKOUT_DURATION_MS = 5 * 60 * 1000;
export const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

export function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}
