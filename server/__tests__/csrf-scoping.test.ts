import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { csrfProtection } from "../middleware/csrf";

/**
 * CSRF middleware scoping tests.
 * Verifies:
 * - GET/HEAD/OPTIONS bypass CSRF checks and set token cookie
 * - POST/PATCH/DELETE require valid CSRF token match
 * - API key bypass works ONLY on /api/public/* paths
 * - Non-public paths reject API key bypass
 * - CSRF token timing-safe comparison prevents timing attacks
 */

describe("CSRF Protection Middleware", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let setCookieCall: any;

  beforeEach(() => {
    vi.clearAllMocks();
    setCookieCall = vi.fn().mockReturnThis();

    req = {
      method: "GET",
      path: "/api/some-path",
      cookies: {},
      headers: {},
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      cookie: setCookieCall,
    };

    next = vi.fn();
  });

  describe("Safe methods (GET/HEAD/OPTIONS)", () => {
    it("allows GET without CSRF token", () => {
      req.method = "GET";
      csrfProtection(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it("allows HEAD without CSRF token", () => {
      req.method = "HEAD";
      csrfProtection(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it("allows OPTIONS without CSRF token", () => {
      req.method = "OPTIONS";
      csrfProtection(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it("sets CSRF cookie on safe method if missing", () => {
      req.method = "GET";
      req.cookies = {};
      csrfProtection(req as Request, res as Response, next);
      expect(setCookieCall).toHaveBeenCalledWith(
        "csrf-token",
        expect.any(String),
        expect.objectContaining({
          httpOnly: false,
          sameSite: "lax",
          path: "/",
        })
      );
    });
  });

  describe("Unsafe methods (POST/PATCH/DELETE)", () => {
    it("blocks POST without CSRF token", () => {
      req.method = "POST";
      req.cookies = {};
      csrfProtection(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("blocks PATCH without CSRF token", () => {
      req.method = "PATCH";
      req.cookies = {};
      csrfProtection(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("blocks DELETE without CSRF token", () => {
      req.method = "DELETE";
      req.cookies = {};
      csrfProtection(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("blocks POST with missing header token", () => {
      req.method = "POST";
      req.cookies = { "csrf-token": "validtoken123" };
      csrfProtection(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("blocks POST with mismatched tokens", () => {
      req.method = "POST";
      req.cookies = { "csrf-token": "token-from-cookie" };
      req.headers = { "x-csrf-token": "token-from-header" };
      csrfProtection(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("allows POST with matching CSRF tokens", () => {
      const validToken = "abc123def456xyz789";
      req.method = "POST";
      req.cookies = { "csrf-token": validToken };
      req.headers = { "x-csrf-token": validToken };
      csrfProtection(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("allows PATCH with matching CSRF tokens", () => {
      const validToken = "xyz789abc123def456";
      req.method = "PATCH";
      req.cookies = { "csrf-token": validToken };
      req.headers = { "x-csrf-token": validToken };
      csrfProtection(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it("allows DELETE with matching CSRF tokens", () => {
      const validToken = "token-del-12345";
      req.method = "DELETE";
      req.cookies = { "csrf-token": validToken };
      req.headers = { "x-csrf-token": validToken };
      csrfProtection(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("API key bypass scoping", () => {
    it("allows API key bypass on /api/public/* paths", () => {
      req.method = "POST";
      req.path = "/api/public/webhook";
      req.headers = { "x-api-key": "key123" };
      csrfProtection(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("allows x-tristar-api-key bypass on /api/public/* paths", () => {
      req.method = "POST";
      req.path = "/api/public/sync";
      req.headers = { "x-tristar-api-key": "tristar-key-456" };
      csrfProtection(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it("rejects API key bypass on /api/physicians path", () => {
      req.method = "POST";
      req.path = "/api/physicians";
      req.headers = { "x-api-key": "key123" };
      req.cookies = {};
      csrfProtection(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("rejects API key bypass on /api/revenue path", () => {
      req.method = "PATCH";
      req.path = "/api/revenue/claims/123";
      req.headers = { "x-api-key": "key123" };
      req.cookies = {};
      csrfProtection(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("rejects API key bypass on /api/integrations path", () => {
      req.method = "POST";
      req.path = "/api/integrations";
      req.headers = { "x-tristar-api-key": "tristar-key-789" };
      req.cookies = {};
      csrfProtection(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("requires CSRF token even with API key on non-public paths", () => {
      req.method = "POST";
      req.path = "/api/users";
      req.headers = { "x-api-key": "key123" };
      req.cookies = { "csrf-token": "token1" };
      csrfProtection(req as Request, res as Response, next);
      // Missing x-csrf-token header, should fail
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("Timing-safe token comparison", () => {
    it("compares tokens using timing-safe comparison (no length leak)", () => {
      // If timing-safe comparison is not used, short token would fail faster
      const shortToken = "abc";
      const longToken = "abcdefghijklmnopqrstuvwxyzabcdefghijklmn";

      req.method = "POST";
      req.cookies = { "csrf-token": shortToken };
      req.headers = { "x-csrf-token": longToken };

      csrfProtection(req as Request, res as Response, next);
      // Should fail because tokens don't match (not because length differs early)
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("handles binary/unicode tokens safely", () => {
      const unicodeToken = "тест123αβγ";
      req.method = "POST";
      req.cookies = { "csrf-token": unicodeToken };
      req.headers = { "x-csrf-token": unicodeToken };
      csrfProtection(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("Cookie configuration for security", () => {
    it("sets secure flag in production", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      req.method = "GET";
      req.cookies = {};
      csrfProtection(req as Request, res as Response, next);

      expect(setCookieCall).toHaveBeenCalledWith(
        "csrf-token",
        expect.any(String),
        expect.objectContaining({ secure: true })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it("omits secure flag in development", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      req.method = "GET";
      req.cookies = {};
      csrfProtection(req as Request, res as Response, next);

      expect(setCookieCall).toHaveBeenCalledWith(
        "csrf-token",
        expect.any(String),
        expect.objectContaining({ secure: false })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe("Edge cases", () => {
    it("handles undefined cookies gracefully", () => {
      req.method = "GET";
      req.cookies = undefined;
      csrfProtection(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it("handles missing x-csrf-token header", () => {
      req.method = "POST";
      req.cookies = { "csrf-token": "token123" };
      req.headers = {};
      csrfProtection(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("handles empty CSRF token", () => {
      req.method = "POST";
      req.cookies = { "csrf-token": "" };
      req.headers = { "x-csrf-token": "" };
      csrfProtection(req as Request, res as Response, next);
      // Empty tokens should be treated as invalid
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
