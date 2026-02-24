import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

export function qstr(val: string | string[] | undefined): string | undefined {
  return Array.isArray(val) ? val[0] : val;
}

export function qstrReq(val: string | string[] | undefined): string {
  return (Array.isArray(val) ? val[0] : val) || "";
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
