import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";
import session from "express-session";
import { createServer, type Server } from "http";
import bcrypt from "bcryptjs";

const mockUsers = new Map<string, any>();

function seedMockUser() {
  const hashedPassword = bcrypt.hashSync("Test1234!", 4);
  mockUsers.set("user-1", {
    id: "user-1",
    name: "Test Admin",
    email: "admin@test.com",
    password: hashedPassword,
    role: "OWNER",
    approvalStatus: "APPROVED",
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    passwordChangedAt: null,
    forcePasswordChange: false,
    passwordResetToken: null,
    passwordResetExpires: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function createAuthApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "test-secret-long-enough",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    })
  );

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    let foundUser: any = undefined;
    for (const user of mockUsers.values()) {
      if (user.email === email) {
        foundUser = user;
        break;
      }
    }

    if (!foundUser) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (foundUser.approvalStatus === "PENDING") {
      return res.status(403).json({ message: "Your account is pending approval" });
    }

    const valid = await bcrypt.compare(password, foundUser.password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    req.session.userId = foundUser.id;
    const { password: _, ...safeUser } = foundUser;
    res.json(safeUser);
  });

  app.get("/api/auth/me", (req, res) => {
    if (!(req.session as any).userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = mockUsers.get((req.session as any).userId);
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ success: true });
    });
  });

  return app;
}

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

describe("Auth Endpoints (mock server)", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createAuthApp();
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;

    return () => {
      server.close();
    };
  });

  beforeEach(() => {
    mockUsers.clear();
    seedMockUser();
  });

  describe("POST /api/auth/login", () => {
    it("should login successfully with valid credentials", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@test.com", password: "Test1234!" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("user-1");
      expect(body.email).toBe("admin@test.com");
      expect(body.password).toBeUndefined();
    });

    it("should return 401 for invalid email", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "wrong@test.com", password: "Test1234!" }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.message).toContain("Invalid");
    });

    it("should return 401 for wrong password", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@test.com", password: "WrongPass1!" }),
      });
      expect(res.status).toBe(401);
    });

    it("should return 400 for missing fields", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("should not include password in response", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@test.com", password: "Test1234!" }),
      });
      const body = await res.json();
      expect(body.password).toBeUndefined();
      expect(body.name).toBe("Test Admin");
    });

    it("should return 403 for pending approval users", async () => {
      mockUsers.set("user-pending", {
        ...mockUsers.get("user-1"),
        id: "user-pending",
        email: "pending@test.com",
        approvalStatus: "PENDING",
      });
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "pending@test.com", password: "Test1234!" }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.message).toContain("pending");
    });
  });

  describe("GET /api/auth/me", () => {
    it("should return 401 when not authenticated", async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("should successfully logout", async () => {
      const res = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });
});
