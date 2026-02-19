import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  SEED_OWNER_PASSWORD: z.string().optional(),
  SEED_USER_PASSWORD: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).optional().default("development"),
  PORT: z.string().optional().default("5000"),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

export function validateEnv(): ValidatedEnv {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map(i => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    console.error(`\n[ENV] Environment validation failed:\n${issues}\n`);
    throw new Error(`Environment validation failed. Check required variables.`);
  }
  console.log("[ENV] Environment validation passed");
  return result.data;
}
