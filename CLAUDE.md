# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Tristar 360° CRM

**Live URL:** https://crm.tristarpt.com
**Repo:** https://github.com/jblack4vols/Code-Companion2

### Tech Stack
- **Frontend:** React 18, Vite 7, TypeScript 5.6, Tailwind CSS 3.4, shadcn/ui (Radix), Wouter (routing), TanStack Query v5
- **Backend:** Express 5, Drizzle ORM, PostgreSQL (Neon)
- **Hosting:** Vercel (static CDN + serverless API function)
- **Fonts:** DM Sans (body), Montserrat (headings), JetBrains Mono (code)
- **Charts:** Recharts
- **Auth:** Session-based (express-session + connect-pg-simple), bcryptjs, CSRF tokens

### Brand & Design
- **Primary (light):** Orange `hsl(30.59, 100%, 50%)` — `#FF8200`
- **Primary (dark):** Blue `hsl(203.77, 87.6%, 52.55%)`
- **Accent:** Light blue `#FFEAD5` tint
- **Background light/dark:** White / Black
- **Style:** Modern Clinical — clean, professional, subtle shadows, WCAG AA accessible
- **Design system doc:** `./docs/design-system.md`

### Business Domain
- **Company:** Tristar Physical Therapy — 8 clinic locations in East Tennessee
- **Locations:** Bean Station, Jefferson City, Johnson City, Maryville, Morristown, New Tazewell, Newport, Rogersville
- **Purpose:** Physician liaison CRM for tracking referring provider relationships, referrals, interactions, and revenue
- **Key metrics:** RPV (Revenue Per Visit) target $95, referral volume, interaction frequency, payer tier mix
- **Payer tiers:** Commercial, Medicare, Medicaid, Workers Comp, Auto/PI
- **User roles:** OWNER, DIRECTOR, MARKETER, FRONT_DESK, ANALYST
- **All users get all locations assigned automatically on creation/approval**
- **HIPAA regulated:** No PHI in logs, URLs, localStorage, or error messages

### Build & Dev Commands
- `npm run dev` — start dev server (port 5000)
- `npm run build` — production build (Vite + esbuild)
- `npm run check` — TypeScript type check (`tsc --noEmit`)
- `npm run db:push` — sync Drizzle schema to database
- `npx vitest run` — run all tests (439 tests, 19 files)
- `npx tsx script/build-vercel.ts` — Vercel-specific build (Vite + esbuild API bundle)
- `npx vercel deploy --prod --yes` — deploy to production

### Database
- **Provider:** Neon PostgreSQL (serverless)
- **ORM:** Drizzle with schema in `shared/schema.ts`
- **Session store:** PostgreSQL via connect-pg-simple
- **Migrations:** `drizzle-kit push` (no migration files, schema push model)

### Key Directories
- `client/src/pages/` — React page components (lazy loaded)
- `client/src/components/` — shared UI components
- `server/routes/` — Express API route handlers
- `server/storage*.ts` — database access layer (split by domain)
- `shared/schema.ts` — Drizzle schema + Zod validation
- `api/index.mjs` — bundled Vercel serverless function (build artifact)
- `docs/` — project documentation
- `server/__tests__/` — Vitest test files

## Role & Responsibilities

Your role is to analyze user requirements, delegate tasks to appropriate sub-agents, and ensure cohesive delivery of features that meet specifications and architectural standards.

## Workflows

- Primary workflow: `./.claude/rules/primary-workflow.md`
- Development rules: `./.claude/rules/development-rules.md`
- Orchestration protocols: `./.claude/rules/orchestration-protocol.md`
- Documentation management: `./.claude/rules/documentation-management.md`
- And other workflows: `./.claude/rules/*`

**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.
**IMPORTANT:** You must follow strictly the development rules in `./.claude/rules/development-rules.md` file.
**IMPORTANT:** Before you plan or proceed any implementation, always read the `./README.md` file first to get context.
**IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
**IMPORTANT:** In reports, list any unresolved questions at the end, if any.

## Hook Response Protocol

### Privacy Block Hook (`@@PRIVACY_PROMPT@@`)

When a tool call is blocked by the privacy-block hook, the output contains a JSON marker between `@@PRIVACY_PROMPT_START@@` and `@@PRIVACY_PROMPT_END@@`. **You MUST use the `AskUserQuestion` tool** to get proper user approval.

**Required Flow:**

1. Parse the JSON from the hook output
2. Use `AskUserQuestion` with the question data from the JSON
3. Based on user's selection:
   - **"Yes, approve access"** → Use `bash cat "filepath"` to read the file (bash is auto-approved)
   - **"No, skip this file"** → Continue without accessing the file

**Example AskUserQuestion call:**
```json
{
  "questions": [{
    "question": "I need to read \".env\" which may contain sensitive data. Do you approve?",
    "header": "File Access",
    "options": [
      { "label": "Yes, approve access", "description": "Allow reading .env this time" },
      { "label": "No, skip this file", "description": "Continue without accessing this file" }
    ],
    "multiSelect": false
  }]
}
```

**IMPORTANT:** Always ask the user via `AskUserQuestion` first. Never try to work around the privacy block without explicit user approval.

## Python Scripts (Skills)

When running Python scripts from `.claude/skills/`, use the venv Python interpreter:
- **Linux/macOS:** `.claude/skills/.venv/bin/python3 scripts/xxx.py`
- **Windows:** `.claude\skills\.venv\Scripts\python.exe scripts\xxx.py`

This ensures packages installed by `install.sh` (google-genai, pypdf, etc.) are available.

**IMPORTANT:** When scripts of skills failed, don't stop, try to fix them directly.

## [IMPORTANT] Consider Modularization
- If a code file exceeds 200 lines of code, consider modularizing it
- Check existing modules before creating new
- Analyze logical separation boundaries (functions, classes, concerns)
- Use kebab-case naming with long descriptive names, it's fine if the file name is long because this ensures file names are self-documenting for LLM tools (Grep, Glob, Search)
- Write descriptive code comments
- After modularization, continue with main task
- When not to modularize: Markdown files, plain text files, bash scripts, configuration files, environment variables files, etc.

## Documentation Management

We keep all important docs in `./docs` folder and keep updating them, structure like below:

```
./docs
├── project-overview-pdr.md
├── code-standards.md
├── codebase-summary.md
├── design-guidelines.md
├── deployment-guide.md
├── system-architecture.md
└── project-roadmap.md
```

**IMPORTANT:** *MUST READ* and *MUST COMPLY* all *INSTRUCTIONS* in project `./CLAUDE.md`, especially *WORKFLOWS* section is *CRITICALLY IMPORTANT*, this rule is *MANDATORY. NON-NEGOTIABLE. NO EXCEPTIONS. MUST REMEMBER AT ALL TIMES!!!*