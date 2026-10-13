import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import path from "path";

const allowlist = [
  "connect-pg-simple",
  "cookie-parser",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "multer",
  "nodemailer",
  "pg",
  "ws",
  "exceljs",
  "xlsx",
  "zod",
  "zod-validation-error",
  "bcryptjs",
  "node-cron",
  "gray-matter",
  "@microsoft/microsoft-graph-client",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client (vite)...");
  await viteBuild();

  console.log("building api serverless function (esbuild)...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  // Bundle everything EXCEPT native/binary deps that must stay external
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/app.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: "api/index.mjs",
    banner: {
      js: `import { createRequire } from 'module'; import { fileURLToPath as __fileURLToPath } from 'url'; import { dirname as __pathDirname } from 'path'; const require = createRequire(import.meta.url); const __filename = __fileURLToPath(import.meta.url); const __dirname = __pathDirname(__filename);`,
    },
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.VERCEL": '"1"',
    },
    minify: true,
    external: externals,
    alias: {
      "@shared": path.resolve("shared"),
    },
    logLevel: "info",
  });

  console.log("vercel build complete");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
