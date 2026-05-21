# Skilling — Architecture

> This document is the authoritative written counterpart to `skill_router_architecture.svg`. It defines structure, contracts, and decision rationale that a diagram alone cannot carry.

---

## Purpose

Skilling is an **MCP server that acts as a universal skill router**. Any MCP-compatible host — Cursor agents, Claude Desktop, custom CLI agents, or any other MCP client — connects, sends a **prompt / goal / context**, and receives back the **right skill text** formatted as a system-prompt addition. After the task, the client **evicts** that addition so the next turn is not polluted.

Two things the router owns: **which skill to return** and **when it is considered active vs cleared**.  
One thing the router does not own: **how** the host merges the returned text into its system prompt.

**Design constraints (non-negotiable):**
- Every dependency must be open source with a permissive license (MIT / Apache 2.0 / BSD).
- No dependency that requires account creation, API keys at install time, or proprietary binaries.
- Token overhead of skill injection is a first-class engineering concern, not an afterthought.

---

## Columns in the Diagram

| Column | What it represents |
|---|---|
| **Clients** | Cursor / Windsurf, Claude Desktop, a custom CLI, or any MCP-compatible host |
| **MCP Server ("Skilling")** | Exposes tools: `skill_select`, `skill_inject`, `skill_cleanup`, `skill_list`, `skill_plan` |
| **Selector** | Pluggable strategy that picks the best-fit skill(s) from candidates |
| **Skill Store** | Local filesystem under a configurable root; files follow `SKILL.md` or `*.skill` convention |
| **Lifecycle column** | Per-request state machine: receive → select → inject → execute → cleanup |

---

## Data / Control Flow

```
Client
  │
  ├─► skill_plan(goal)          ← optional: get full implementation plan + needed skills first
  │       └─► structured plan back (skill refs, order, rationale)
  │
  ├─► skill_select(prompt)      ← scoring pass on summaries only (cheap)
  │       └─► skill_id + confidence + rationale
  │
  ├─► skill_inject(skill_id)    ← load body, return injectable system-prompt fragment
  │       └─► { skill_id, body, ttl_hint, correlation_id }
  │
  │   [agent executes task with injected fragment]
  │
  └─► skill_cleanup(correlation_id)   ← client removes fragment; server clears ephemeral state
```

**Inbound** — Client sends prompt + goal + optional context via MCP tool call.  
**Selection** — Selector scores candidates using only skill *summaries* (≤ 60 tokens each) — the full body is never read during selection.  
**Outbound** — Server returns skill text meant to be merged into system instructions for that task only.  
**Cleanup** — Client removes the addition; server clears any correlation-keyed state.

---

## Token Efficiency — Core Design Principle

Injecting full skill bodies unconditionally is the leading cause of context bloat in skill-augmented agents. Research (Skill0, arXiv:2604.02268) shows naïve full injection can cost 2–5× more tokens per step than a filtered, summary-first approach, with *worse* task performance due to retrieval noise.

Skilling addresses this at the architecture level via **tiered skill manifests**:

### Tier 0 — Index (always in memory, ~5 tokens per skill)
```
skill_id | title
```
Used for: `skill_list`, candidate enumeration.

### Tier 1 — Summary (loaded during selection, ~60 tokens per skill)
```yaml
id: canvas
title: "Cursor Canvas Renderer"
summary: "Render analytical artifacts as live React apps beside chat."
tags: [react, visualization, canvas]
triggers: ["make a chart", "show data", "render a table"]
```
Used for: `skill_select` — the selector reads *only* summaries, never full bodies.

### Tier 2 — Body (loaded only after selection, 200–2000 tokens)
The full `SKILL.md` content, returned by `skill_inject`.

### Budget Enforcement
- Each `skill_inject` call declares a **token estimate** for the body it returns.
- Clients may pass an optional `token_budget` in the select call; the router will not recommend skills whose combined body would exceed it.
- Default budget: **2048 tokens** per inject operation. Configurable via server options.

### Helpfulness Filtering (inspired by Skill0's Dynamic Curriculum)
Skills are not injected blindly. The selector filters the candidate set to only those where:
1. Tags / triggers match the current prompt (heuristic, zero-cost).
2. Optionally: confidence score from LLM-assisted ranking exceeds threshold (when enabled).

Skills that match nothing are dropped silently — "no match" returns an empty response, not a fallback dump of the entire skill library.

---

## MCP Tool Surface

### `skill_list()`
**Input:** none  
**Output:** `[{ id, title, summary, tags }]` — Tier 0 + Tier 1 data only, never bodies.

### `skill_select(prompt, context?, token_budget?)`
**Input:** user goal / prompt string; optional workspace hints; optional token budget  
**Output:** `{ skill_id, confidence, rationale, warnings[] }`  
- Uses Tier 1 summaries only — fast and cheap regardless of skill library size.
- Returns `null` on no match (client should proceed without injection).

### `skill_inject(skill_id, correlation_id?)`
**Input:** skill id from a prior `skill_select` result; optional caller-supplied correlation id  
**Output:** `{ skill_id, body, token_estimate, ttl_hint, correlation_id }`  
- Loads Tier 2 body on demand.
- Strips non-injectable sections (meta-comments, internal checklists) before returning.
- Wraps body with a short activation header: *"The following skill applies only to this task."*

### `skill_cleanup(correlation_id)`
**Input:** correlation id from the inject response  
**Output:** `{ ok: true }` — idempotent, safe to call multiple times.

### `skill_plan(goal, context?)`
**Input:** high-level goal or task description; optional workspace/context hints  
**Output:**
```json
{
  "plan": [
    { "step": 1, "description": "...", "skill_id": "canvas", "rationale": "..." },
    { "step": 2, "description": "...", "skill_id": null, "rationale": "No skill needed" }
  ],
  "skills_needed": ["canvas", "create-rule"],
  "estimated_tokens": 1840
}
```
This tool lets the agent **front-load planning** before execution. The agent reads summaries of all needed skills and forms a complete implementation plan before injecting any body — avoiding mid-task context thrash and giving the agent a chance to reconsider scope. Skills are not injected by this call; the plan is advisory.

---

## Pluggable Selector — Strategy Interface

The selector is behind a single interface. Swapping implementations does not change the MCP surface.

| Strategy | When to use | Dependencies |
|---|---|---|
| **Heuristic / rules** | Skills declare tags, glob patterns, and trigger phrases in front matter; keyword-match against prompt | None — pure string matching |
| **Embedding similarity** | Optional local vector comparison using a bundled ONNX embedding model | `onnxruntime` (Apache 2.0) + a public sentence-transformer model |
| **LLM-assisted ranking** | Model reads short skill summaries and returns ranked ids | One HTTP call to a local or remote model; isolated behind the strategy interface |

**Default for v1:** heuristic rules only. The router is fully functional with zero network calls and zero ML dependencies.

**If embedding is enabled:** Use a model that ships as a local file (e.g., `all-MiniLM-L6-v2` via `@xenova/transformers`, Apache 2.0), never a remote embedding API.

---

## Skill Store Contract

- **Root:** Configurable directory — not hard-coded. Set via `SKILLING_SKILLS_ROOT` env var or server config.
- **Artifacts:** One primary document per skill (`SKILL.md` or `*.skill`). Optional sibling files (examples, checklists, scripts) referenced by relative path.
- **Manifest / Front matter:**
  ```yaml
  ---
  id: canvas
  title: "Cursor Canvas Renderer"
  summary: "Render analytical artifacts as live React apps beside chat."
  version: "1.0.0"
  tags: [react, visualization, canvas, charts]
  triggers: ["make a chart", "render a table", "show data visually"]
  token_estimate: 1200
  ---
  ```
- **Validation at load time:**
  - Reject files that exceed `MAX_SKILL_BODY_BYTES` (default: 32 KB).
  - Reject path traversal (`..` segments, symlink escape).
  - Reject binary content.
  - Warn on missing `summary` — falls back to first 80 characters of body.
- **Versioning:** Prefer immutable skill versions referenced by id. "latest" alias allowed only in development.

---

## Per-Request Lifecycle (Expanded)

1. **Receive** — Normalize inputs (encoding, length limit). Attach a `correlation_id` for the inject/cleanup pair.
2. **Tier 1 scan** — Load summaries of all skills (or a tag-filtered subset). This is fast; summaries are small.
3. **Select** — Strategy returns `skill_id` + confidence. On tie: pick highest `token_estimate` that fits budget. On no match: return empty — do not fall back to dumping all skills.
4. **Authorize** — Check that the requesting client / workspace is allowed to load this skill namespace (optional; important for multi-user or shared machines).
5. **Load & shape** — Read Tier 2 body. Strip internal-only sections. Wrap with activation header.
6. **Respond** — Return `{ skill_id, body, token_estimate, ttl_hint, correlation_id }`.
7. **Client executes** — Host merges into system stack (`role: system`, `ephemeral: true`). User task runs.
8. **Cleanup** — On explicit `cleanup` call, task-completion hook, or TTL expiry: client drops fragment. Server clears ephemeral state keyed by `correlation_id`.

Steps 4–6 are the usual gaps omitted from diagram-only documentation.

---

## Session and Concurrency Semantics

- **Idempotent cleanup:** Calling cleanup twice must not error.
- **Concurrent selects:** Each `correlation_id` isolates injected state. Responses must not cross streams.
- **Long-running tasks:** If the client cannot call cleanup, document a **TTL** (default: 30 minutes) after which the skill is treated as inactive. Server remains correct when stateless.

---

## Security and Abuse Resistance

- **Path confinement:** Resolve skill paths only under the configured root. Deny symlink escape.
- **Size limits:** `MAX_SKILL_BODY_BYTES` cap on file size. `MAX_INJECT_BYTES` cap on total injected bytes per response (default: 8 KB).
- **No arbitrary code execution from skills:** Skills are data (text). Any shell behavior belongs in the host agent, not the router process.
- **Logging:** Log `skill_id` and `correlation_id` only — never full user prompts — unless policy explicitly allows it.

---

## Observability (Lightweight)

- **Metrics to count:** selects, inject calls, cleanup calls, errors, empty selections, token estimates served.
- **Tracing:** Propagate `correlation_id` through select → inject → cleanup in structured logs.
- **Health check:** Read-only verify that the skill root is readable and all front-matter manifests parse.

All of the above implemented as stdout JSON logs in v1. No metrics library required.

---

## Failure Modes

| Failure | Desired behavior |
|---|---|
| Skill file missing after select | Return structured error; do not partially inject |
| Selector returns unknown id | Validate against store before responding |
| Store unreadable | Degraded mode: `skill_list` errors clearly; select returns `{ skill_id: null, reason: "unavailable" }` |
| Client never calls cleanup | TTL policy; server stateless so no leak |
| Front matter missing summary | Warn; generate stub summary from first 80 chars of body |
| Token budget exceeded | Return top-N skills that fit; include `truncated: true` in response |

---

## Dependency Rules (Open Source Only)

| Category | Allowed | Forbidden |
|---|---|---|
| Transport | `@modelcontextprotocol/sdk` (MIT) | Any proprietary MCP wrapper |
| Filesystem | Node.js built-ins | Cloud storage SDKs at core |
| Embedding (optional) | `@xenova/transformers` (Apache 2.0), local ONNX models | OpenAI Embeddings API, Cohere, etc. in core |
| LLM ranking (optional) | Any locally-running model via `ollama` REST, or any model via configurable base URL | Hard-coded to a specific proprietary API |
| Parsing | `gray-matter` (MIT) for front matter | Heavy CMS or document frameworks |
| Testing | `vitest` (MIT) | Proprietary test runners |
| Build | `esbuild` / `tsup` (MIT) | Locked build toolchains |

**Core router rule:** if the skill root is readable, the router must work with zero network calls and zero accounts. All optional capabilities (embedding, LLM ranking) are additive, opt-in, and isolated behind the selector interface.

---

## Relation to the Visual Diagram

- **Solid arrows** — Normal request path: clients → Skilling; Router → selector; selector → skill store; Router ↔ lifecycle.
- **Dashed arrows** — The injectable system prompt is the **return value** to the calling agent, not a hidden side channel.

For the authoritative graphic, see `skill_router_architecture.svg`.
