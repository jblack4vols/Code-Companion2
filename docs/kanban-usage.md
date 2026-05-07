# Kanban Board Usage Guide

The project includes a visual Kanban dashboard for tracking implementation plans, powered by the `plans-kanban` skill.

## Prerequisites

Install dependencies (one-time setup):

```bash
cd .opencode/skills/plans-kanban
npm install
```

## Starting the Dashboard

```bash
# Basic usage — view all plans
node .opencode/skills/plans-kanban/scripts/server.cjs --dir ./plans

# Open in browser automatically
node .opencode/skills/plans-kanban/scripts/server.cjs --dir ./plans --open

# Remote access (bind all interfaces)
node .opencode/skills/plans-kanban/scripts/server.cjs --dir ./plans --host 0.0.0.0 --open

# Run in background
node .opencode/skills/plans-kanban/scripts/server.cjs --dir ./plans --background
```

The dashboard runs on port 3500 by default (auto-increments if busy).

## Stopping the Server

```bash
node .opencode/skills/plans-kanban/scripts/server.cjs --stop
```

## Plan Directory Structure

The dashboard scans for directories containing a `plan.md` file:

```
plans/
├── active/                              # Currently active improvement work
│   └── improvement-backlog/
│       └── plan.md
├── 260227-0627-unit-economics-.../      # Feature plans (date-prefixed)
│   ├── plan.md
│   ├── phase-01-data-model.md
│   └── phase-02-*.md
├── 260227-0922-revenue-leakage-.../
│   ├── plan.md
│   └── phase-*.md
├── reports/                             # Completion reports
│   └── *.md
└── templates/                           # Plan templates (excluded from dashboard)
    └── *.md
```

## Plan File Format

Each `plan.md` uses YAML frontmatter for metadata:

```markdown
---
title: "Feature Name"
description: "Brief description"
status: pending | in-progress | completed
priority: P0 | P1 | P2
effort: 8h
tags: [tag1, tag2]
created: 2026-01-15
---

# Feature Name

## Summary
Brief description of the feature or improvement.

## Phases

| # | Phase | Status | Effort | Depends On |
|---|---|---|---|---|
| 1 | Data Model | completed | 2h | -- |
| 2 | Backend | in-progress | 4h | Phase 1 |
| 3 | Frontend | pending | 4h | Phase 2 |

## Phase 1: Data Model

### Tasks
- [x] Define schema tables
- [x] Create insert schemas
- [ ] Add indexes
```

## Dashboard Features

- **Progress tracking**: Visual progress bars per plan based on phase completion
- **Phase status**: Breakdown of completed, in-progress, and pending phases
- **Timeline view**: Gantt-style visualization of plan durations
- **Activity heatmap**: Recent modification activity
- **Priority indicators**: Color-coded by P0/P1/P2 priority

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--dir <path>` | Plans directory to scan | (required) |
| `--port <number>` | Server port | 3500 |
| `--host <addr>` | Bind address (`0.0.0.0` for remote) | localhost |
| `--open` | Auto-open browser | false |
| `--background` | Run detached in background | false |
| `--stop` | Stop all running servers | false |

## API Endpoints

The dashboard also exposes a JSON API:

| Route | Description |
|-------|-------------|
| `GET /api/plans` | All plans as JSON |
| `GET /api/plans?dir=<path>` | Plans from a specific directory |
