import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const CSRF_HEADER = "x-csrf-token";
const CSRF_COOKIE = "csrf-token";

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    let token = req.cookies?.[CSRF_COOKIE];
    if (!token) {
      token = generateToken();
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
    }
    return next();
  }

  if (req.path.startsWith("/api/public/") && (req.headers["x-api-key"] || req.headers["x-tristar-api-key"])) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER] as string;

  if (!cookieToken || !headerToken) {
    return res.status(403).json({ message: "Invalid or missing CSRF token" });
  }

  const cookieBuf = Buffer.from(cookieToken, "utf8");
  const headerBuf = Buffer.from(headerToken, "utf8");

  if (cookieBuf.length !== headerBuf.length || !crypto.timingSafeEqual(cookieBuf, headerBuf)) {
    return res.status(403).json({ message: "Invalid or missing CSRF token" });
  }

  next();
}

export function csrfTokenEndpoint(_req: Request, res: Response) {
  let token = _req.cookies?.[CSRF_COOKIE];
  if (!token) {
    token = generateToken();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  }
  res.json({ token });
}
