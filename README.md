# SkillPilot

**The right skill, at the right time — without filling your context window.**

SkillPilot is an open-source MCP server that routes agent skills from your filesystem. It picks the best skill for each task, injects only what you need, and cleans up when the work is done. Built for Cursor, Claude Desktop, and any MCP-compatible host.

---

## Why SkillPilot?

Agents work better with skills — structured playbooks for code review, MCP development, UI design, and more. But dumping entire skill libraries into every turn is expensive: wrong skills add noise, large bodies burn tokens, and stale guidance lingers after a task ends.

SkillPilot treats context as a budget:

- **Select on summaries, not full files** — routing reads ~60 tokens per skill, not thousands.
- **Inject with depth control** — summary, compact, section, or full body depending on what you need.
- **Plan before you execute** — map which skills a multi-step goal needs before loading anything heavy.
- **End tasks cleanly** — `end_task` evicts injected guidance so the next conversation stays focused.

Research on skill-augmented agents (e.g. [Skill0](https://arxiv.org/abs/2604.02268)) shows filtered, summary-first routing can cut per-step token cost sharply versus naïve full injection — often with better task alignment. SkillPilot brings that discipline to inference-time MCP workflows.

---

## How it works

```text
Your prompt
    │
    ▼
skill_plan (optional)     ← Tier 1 only: which skills, in what order
    │
    ▼
begin_task                  ← match + shaped inject + session file
    │
    ▼
Agent works with skill body
    │
    ▼
end_task                    ← cleanup + clear session
```

Skills live as folders under **`.agents/skills/<skill-id>/SKILL.md`**. SkillPilot-specific metadata (tags, triggers, inject defaults) can live in **`.agents/skills-meta/<skill-id>.yaml`** so ecosystem skills survive `npx skills update` without hand-editing upstream files.

---

## Features

| Capability | What you get |
|------------|----------------|
| **Heuristic routing** | Tag and trigger matching on Tier 1 metadata; no LLM required for selection |
| **Token budgets** | Exclude skills whose bodies exceed your remaining context headroom |
| **Inject modes** | `summary` · `compact` · `sections` · `full` — escalate only when stuck |
| **Task lifecycle** | `begin_task` / `end_task` with `.skillpilot/session.json` as source of truth |
| **Metadata overlays** | Patch routing for community skills without touching their `SKILL.md` bodies |
| **Open stack** | Node.js, stdio MCP, MIT-friendly deps — no API keys at install time |

---

## Quick start

**Requirements:** Node.js 18+

```bash
git clone <your-fork-url>
cd SkillPilot
npm install
npm run build
```

Point your MCP host at the built server and set the skill root:

```json
{
  "mcpServers": {
    "skillpilot": {
      "command": "node",
      "args": ["<REPO>/SkillPilot/dist/index.js"],
      "env": {
        "SKILL_ROOT": "<REPO>/SkillPilot/.agents/skills"
      }
    }
  }
}
```

See [`docs/mcp-config.example.json`](docs/mcp-config.example.json) for a full template.

**Verify locally:**

```bash
# Bash
export SKILL_ROOT="$(pwd)/.agents/skills"
npm run smoke

# PowerShell
$env:SKILL_ROOT = "$PWD/.agents/skills"
npm run smoke
```

---

## Growing your skill catalog

1. **Discover** — use the bundled **find-skills** skill or `npx skills find <query>` on [skills.sh](https://skills.sh/).
2. **Install project-local** — from the repo root: `npx skills add <package> -y` (no `-g`). Skills land in `.agents/skills/`.
3. **Add routing metadata** — create `.agents/skills-meta/<id>.yaml` with `tags`, `triggers`, and optional `inject_mode_default: compact` for large skills.
4. **Route** — MCP reads `.agents/skills` and merges overlays automatically.

Details: [`docs/SKILLS_CATALOG.md`](docs/SKILLS_CATALOG.md)

---

## MCP tools

Lifecycle tools (recommended for agents):

| Tool | Purpose |
|------|---------|
| `skill_plan` | Plan which skills a goal needs — summaries only, no bodies loaded |
| `begin_task` | Select, inject, and open a task session |
| `end_task` | Cleanup and clear the session |
| `get_session` | Read the active episode (optional body) |

Low-level tools (debugging and custom flows):

| Tool | Aliases |
|------|---------|
| `list` | `skill_list` |
| `select` | `skill_select` |
| `load` | `skill_inject` |
| `cleanup` | `skill_cleanup` |
| `health` | — |
| `ingest` | Optional copy into legacy `skills/` tree |

`load` and `begin_task` support **`inject_mode`** (`summary` | `compact` | `sections` | `full`) and **`token_budget`** to auto-pick depth. See [`docs/CONTEXT_ENGINEERING.md`](docs/CONTEXT_ENGINEERING.md).

---

## Configuration

Copy [`skillpilot.config.json.example`](skillpilot.config.json.example) to `skillpilot.config.json` to tune defaults:

```json
{
  "skillsRoot": "./.agents/skills",
  "defaultInjectMode": "compact",
  "maxInjectBytes": 8192,
  "defaultTokenBudget": 2048
}
```

Resolution order for the skill root: `--skill-root` → `SKILL_ROOT` env → config file → `./.agents/skills`.

MCP protocol traffic uses **stdout** only; logs go to **stderr** as structured JSON.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the MCP server (stdio) |
| `npm test` | Unit tests |
| `npm run smoke` | End-to-end MCP lifecycle check |
| `npm run benchmark` | Token savings + selection regression |
| `npm run skills:add -- <pkg>` | Install a skill into `.agents/skills` |

---

## Project layout

```text
SkillPilot/
├── .agents/skills/          ← canonical skill catalog (SKILL.md per skill)
├── .agents/skills-meta/     ← SkillPilot overlays (tags, triggers, inject defaults)
├── src/                     ← MCP server (TypeScript)
├── skillpilot_docs/         ← architecture, spec, token strategy, roadmap
├── docs/                    ← host setup, catalog, context engineering
└── .skillpilot/             ← active session (gitignored): session.json, bridge files
```

The legacy `skills/` directory is optional — used only if you dogfood the `ingest` tool.

---

## Documentation

| Doc | Topic |
|-----|--------|
| [Architecture](skillpilot_docs/ARCHITECTURE.md) | Tiers, lifecycle, design constraints |
| [Specification](skillpilot_docs/SPEC.md) | Tool contracts and error codes |
| [Context engineering](docs/CONTEXT_ENGINEERING.md) | Inject ladder and overlay workflow |
| [Host setup](docs/HOST_MCP_SETUP.md) | Cursor and VS Code MCP wiring |
| [Skills catalog](docs/SKILLS_CATALOG.md) | Install, overlay, and route skills |
| [Autonomous usage](docs/AUTONOMOUS_USAGE.md) | Hooks, session file, agent policy |

---

## License

ISC — see package metadata. Dependencies are permissive open source (MIT / Apache 2.0 / BSD).
