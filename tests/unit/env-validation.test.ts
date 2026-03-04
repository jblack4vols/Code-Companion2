import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  SEED_OWNER_PASSWORD: z.string().optional(),
  SEED_USER_PASSWORD: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).optional().default("development"),
  PORT: z.string().optional().default("5000"),
});

function validateEnv(env: Record<string, string | undefined>) {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error("Environment validation failed");
  }
  return result.data;
}

describe("Environment Validation", () => {
  it("should pass with valid required env vars", () => {
    const env = {
      DATABASE_URL: "postgresql://localhost:5432/testdb",
      SESSION_SECRET: "a-very-long-secret-key-here",
    };
    const result = validateEnv(env);
    expect(result.DATABASE_URL).toBe(env.DATABASE_URL);
    expect(result.SESSION_SECRET).toBe(env.SESSION_SECRET);
    expect(result.NODE_ENV).toBe("development");
    expect(result.PORT).toBe("5000");
  });

  it("should fail when DATABASE_URL is missing", () => {
    const env = {
      SESSION_SECRET: "a-very-long-secret-key-here",
    };
    expect(() => validateEnv(env)).toThrow("Environment validation failed");
  });

  it("should fail when DATABASE_URL is empty", () => {
    const env = {
      DATABASE_URL: "",
      SESSION_SECRET: "a-very-long-secret-key-here",
    };
    expect(() => validateEnv(env)).toThrow("Environment validation failed");
  });

  it("should fail when SESSION_SECRET is missing", () => {
    const env = {
      DATABASE_URL: "postgresql://localhost:5432/testdb",
    };
    expect(() => validateEnv(env)).toThrow("Environment validation failed");
  });

  it("should fail when SESSION_SECRET is too short", () => {
    const env = {
      DATABASE_URL: "postgresql://localhost:5432/testdb",
      SESSION_SECRET: "short",
    };
    expect(() => validateEnv(env)).toThrow("Environment validation failed");
  });

  it("should accept valid NODE_ENV values", () => {
    for (const nodeEnv of ["development", "production", "test"]) {
      const env = {
        DATABASE_URL: "postgresql://localhost:5432/testdb",
        SESSION_SECRET: "a-very-long-secret-key-here",
        NODE_ENV: nodeEnv,
      };
      const result = validateEnv(env);
      expect(result.NODE_ENV).toBe(nodeEnv);
    }
  });

  it("should reject invalid NODE_ENV values", () => {
    const env = {
      DATABASE_URL: "postgresql://localhost:5432/testdb",
      SESSION_SECRET: "a-very-long-secret-key-here",
      NODE_ENV: "staging",
    };
    expect(() => validateEnv(env)).toThrow("Environment validation failed");
  });

  it("should accept optional SEED passwords", () => {
    const env = {
      DATABASE_URL: "postgresql://localhost:5432/testdb",
      SESSION_SECRET: "a-very-long-secret-key-here",
      SEED_OWNER_PASSWORD: "owner123",
      SEED_USER_PASSWORD: "user123",
    };
    const result = validateEnv(env);
    expect(result.SEED_OWNER_PASSWORD).toBe("owner123");
    expect(result.SEED_USER_PASSWORD).toBe("user123");
  });

  it("should default PORT to 5000 when not provided", () => {
    const env = {
      DATABASE_URL: "postgresql://localhost:5432/testdb",
      SESSION_SECRET: "a-very-long-secret-key-here",
    };
    const result = validateEnv(env);
    expect(result.PORT).toBe("5000");
  });

  it("should accept a custom PORT", () => {
    const env = {
      DATABASE_URL: "postgresql://localhost:5432/testdb",
      SESSION_SECRET: "a-very-long-secret-key-here",
      PORT: "3000",
    };
    const result = validateEnv(env);
    expect(result.PORT).toBe("3000");
  });
});
