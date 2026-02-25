import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import pg from "pg";

async function dropTrgmIndexes() {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    const indexes = [
      "idx_physicians_firstname_trgm",
      "idx_physicians_lastname_trgm",
      "idx_physicians_practicename_trgm",
      "idx_physicians_city_trgm",
      "idx_referrals_provider_trgm",
      "idx_referrals_patient_trgm",
    ];
    for (const idx of indexes) {
      await client.query(`DROP INDEX IF EXISTS "${idx}"`);
    }
    console.log("dropped trgm indexes before db:push");
  } catch (e) {
    console.warn("could not drop trgm indexes:", e);
  } finally {
    await client.end();
  }
}

const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "exceljs",
  "zod",
  "zod-validation-error",
];

async function runDbPush() {
  const { execSync } = await import("child_process");
  try {
    execSync("npx drizzle-kit push --force", { stdio: "inherit" });
    console.log("db:push completed");
  } catch (e) {
    console.warn("db:push warning:", e);
  }
}

async function recreateTrgmIndexes() {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_physicians_firstname_trgm ON physicians USING gin (first_name gin_trgm_ops)`,
      `CREATE INDEX IF NOT EXISTS idx_physicians_lastname_trgm ON physicians USING gin (last_name gin_trgm_ops)`,
      `CREATE INDEX IF NOT EXISTS idx_physicians_practicename_trgm ON physicians USING gin (practice_name gin_trgm_ops)`,
      `CREATE INDEX IF NOT EXISTS idx_physicians_city_trgm ON physicians USING gin (city gin_trgm_ops)`,
      `CREATE INDEX IF NOT EXISTS idx_referrals_provider_trgm ON referrals USING gin (referring_provider_name gin_trgm_ops)`,
      `CREATE INDEX IF NOT EXISTS idx_referrals_patient_trgm ON referrals USING gin (patient_full_name gin_trgm_ops)`,
    ];
    for (const sql of indexes) {
      await client.query(sql).catch(err => console.warn(`Index warning: ${err.message}`));
    }
    console.log("recreated trgm indexes after db:push");
  } catch (e) {
    console.warn("could not recreate trgm indexes (non-fatal):", e);
  } finally {
    await client.end();
  }
}

async function buildAll() {
  await dropTrgmIndexes();
  await runDbPush();
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  await recreateTrgmIndexes();
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
