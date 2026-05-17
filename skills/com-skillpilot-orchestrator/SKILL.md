---
id: com-skillpilot-orchestrator
title: SkillPilot task orchestration
summary: Use MCP begin_task and end_task per dev stage; do not read skill files directly from disk.
tags:
  - skillpilot
  - workflow
version: 1.0.0
---

## When to use

Apply when the host has SkillPilot MCP and you need a repeatable **select → load → work → cleanup** loop across development stages.

## Phase hints for begin_task

| phase | Typical work |
|-------|----------------|
| `plan` | Scoping, design, tradeoffs |
| `implement` | Coding, wiring, refactors |
| `review` | PR/diff review, security pass |
| `ci` | Failing checks, triage logs |

## Procedure

1. **`begin_task`** with `prompt` (user goal) and optional `phase`.
2. Obey returned **`body`** until the stage is done.
3. **`end_task`** before switching topic or phase; start a new **`begin_task`** for the next stage.

## Do not

- Read `skills/` paths directly when MCP tools are available.
- Skip **`end_task`** when moving to unrelated work (avoids stale procedure in context).
