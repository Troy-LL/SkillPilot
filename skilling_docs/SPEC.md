# Skilling — Technical Specification

> Version: draft-1 | Status: living document  
> This spec governs what Skilling must do. `architecture.md` governs how it is structured. `PHILOSOPHY.md` governs why choices are made.

---

## 1. Scope

This document specifies:
- The MCP tool interface (inputs, outputs, error contracts)
- The skill file format and front-matter schema
- The selector strategy interface
- Token budget enforcement rules
- Lifecycle and session semantics
- Configuration schema

It does not specify internal implementation details (data structures, file layout, import graph). Those live in code.

---

## 2. MCP Tool Definitions

All tools are exposed as standard MCP tools via stdio or streamable-HTTP transport. The server MUST support at minimum the stdio transport (requirement for Cursor and Claude Desktop compatibility).

### 2.1 `skill_list`

**Description:** Returns the index of all available skills. Uses Tier 0 + Tier 1 data only — never loads skill bodies.

**Input schema:**
```json
{
  "type": "object",
  "properties": {
    "tags": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Optional tag filter. If provided, return only skills with at least one matching tag."
    }
  },
  "required": []
}
```

**Output schema:**
```json
{
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "id":       { "type": "string" },
      "title":    { "type": "string" },
      "summary":  { "type": "string" },
      "tags":     { "type": "array", "items": { "type": "string" } },
      "version":  { "type": "string" }
    },
    "required": ["id", "title", "summary"]
  }
}
```

**Error cases:** If the skill root is unreadable, return a structured MCP error with `code: "STORE_UNAVAILABLE"`.

---

### 2.2 `skill_select`

**Description:** Given a prompt or goal, return the best-matching skill id. Selection operates on Tier 1 summaries only — full bodies are never read during this call.

**Input schema:**
```json
{
  "type": "object",
  "properties": {
    "prompt": {
      "type": "string",
      "description": "The user prompt, goal, or task description to match against."
    },
    "context": {
      "type": "string",
      "description": "Optional additional context (e.g., current file type, workspace name)."
    },
    "token_budget": {
      "type": "integer",
      "description": "Optional upper bound on the token_estimate of the selected skill's body. Skills exceeding this are excluded from consideration."
    },
    "top_k": {
      "type": "integer",
      "default": 1,
      "description": "Return up to this many skill candidates ranked by score."
    }
  },
  "required": ["prompt"]
}
```

**Output schema:**
```json
{
  "type": "object",
  "properties": {
    "skill_id":   { "type": ["string", "null"] },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "rationale":  { "type": "string" },
    "warnings":   { "type": "array", "items": { "type": "string" } },
    "candidates": {
      "type": "array",
      "description": "Populated when top_k > 1",
      "items": {
        "type": "object",
        "properties": {
          "skill_id":   { "type": "string" },
          "confidence": { "type": "number" }
        }
      }
    }
  },
  "required": ["skill_id", "confidence", "rationale"]
}
```

**Behavior on no match:** Return `{ skill_id: null, confidence: 0, rationale: "No skill matched the given prompt." }`. MUST NOT return a fallback skill or inject anything.

---

### 2.3 `skill_inject`

**Description:** Load the full body of a skill and return it as an injectable system-prompt fragment. This is the only call that reads Tier 2 data.

**Input schema:**
```json
{
  "type": "object",
  "properties": {
    "skill_id": {
      "type": "string",
      "description": "The skill id to load. Should come from a prior skill_select result."
    },
    "correlation_id": {
      "type": "string",
      "description": "Optional caller-supplied id to track this inject/cleanup pair. Server will generate one if not provided."
    }
  },
  "required": ["skill_id"]
}
```

**Output schema:**
```json
{
  "type": "object",
  "properties": {
    "skill_id":       { "type": "string" },
    "body":           { "type": "string", "description": "The injectable skill text." },
    "token_estimate": { "type": "integer", "description": "Estimated token count of body." },
    "ttl_hint":       { "type": "integer", "description": "Suggested TTL in seconds. 0 = no hint." },
    "correlation_id": { "type": "string" },
    "merge_hint": {
      "type": "object",
      "properties": {
        "role":      { "type": "string", "enum": ["system"] },
        "ephemeral": { "type": "boolean", "default": true }
      }
    }
  },
  "required": ["skill_id", "body", "token_estimate", "correlation_id"]
}
```

**Body shaping rules (applied before return):**
1. Strip any section marked with the comment `<!-- internal-only -->` or a front-matter field `inject: false`.
2. Prepend: `> The following skill applies only to the current task. Discard after task completion.\n\n`
3. Enforce `MAX_INJECT_BYTES` (default: 8192 bytes). If body exceeds limit, return a structured error `code: "BODY_TOO_LARGE"`.

---

### 2.4 `skill_cleanup`

**Description:** Signal that the injected skill fragment should be considered inactive. Idempotent.

**Input schema:**
```json
{
  "type": "object",
  "properties": {
    "correlation_id": {
      "type": "string",
      "description": "The correlation_id from the skill_inject response."
    }
  },
  "required": ["correlation_id"]
}
```

**Output schema:**
```json
{
  "type": "object",
  "properties": {
    "ok":         { "type": "boolean" },
    "skill_id":   { "type": "string" },
    "evicted_at": { "type": "string", "format": "date-time" }
  },
  "required": ["ok"]
}
```

**Behavior:** Calling with an unknown or already-cleaned `correlation_id` MUST return `{ ok: true }` — never an error. This makes cleanup safe to call defensively.

---

### 2.5 `skill_plan`

**Description:** Given a high-level goal, return a structured implementation plan that identifies which skills will be needed, in what order, and why. Reads Tier 1 summaries only. Does NOT inject any skill bodies.

This tool is the entry point for **plan-before-execute** workflows. It lets an agent front-load skill selection reasoning before any expensive body loads occur.

**Input schema:**
```json
{
  "type": "object",
  "properties": {
    "goal": {
      "type": "string",
      "description": "The high-level task or goal to plan for."
    },
    "context": {
      "type": "string",
      "description": "Optional: workspace hints, current file, tech stack, etc."
    },
    "max_skills": {
      "type": "integer",
      "default": 5,
      "description": "Maximum number of skills to reference in the plan."
    }
  },
  "required": ["goal"]
}
```

**Output schema:**
```json
{
  "type": "object",
  "properties": {
    "plan": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "step":        { "type": "integer" },
          "description": { "type": "string" },
          "skill_id":    { "type": ["string", "null"] },
          "rationale":   { "type": "string" }
        },
        "required": ["step", "description", "rationale"]
      }
    },
    "skills_needed":     { "type": "array", "items": { "type": "string" } },
    "estimated_tokens":  { "type": "integer", "description": "Sum of token_estimate for all referenced skills." },
    "confidence":        { "type": "number", "minimum": 0, "maximum": 1 }
  },
  "required": ["plan", "skills_needed", "estimated_tokens"]
}
```

**Implementation note:** The plan is generated by the selector strategy operating over Tier 1 summaries. With the heuristic selector, the plan is built from tag/trigger matching and returned with `confidence: null`. With an LLM-assisted selector, the full goal is passed to the ranker with the skill summaries and a structured plan prompt.

---

## 3. Skill File Format

### 3.1 Directory Structure

```
skills/
  <skill-id>/
    SKILL.md          ← required: front matter + injectable body
    examples/         ← optional: example files referenced by body
    scripts/          ← optional: helper scripts (not injected)
    assets/           ← optional: non-text assets
```

Single-file skills are also supported:
```
skills/
  canvas.skill.md     ← front matter + body in one file
```

### 3.2 Front Matter Schema (YAML)

All fields in the `---` block at the top of `SKILL.md`.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Unique identifier. Lowercase, hyphens only. |
| `title` | string | yes | Human-readable name. ≤ 60 characters. |
| `summary` | string | yes | One sentence: what it does and when to use it. ≤ 120 characters. |
| `version` | string | no | Semver string. Defaults to `"1.0.0"`. |
| `tags` | string[] | no | Broad category labels for coarse filtering. |
| `triggers` | string[] | no | Natural-language phrases that signal this skill is needed. |
| `token_estimate` | integer | no | Approximate token count of the injectable body. Auto-computed if absent. |
| `inject` | boolean | no | Set to `false` to prevent injection (e.g., meta-skill templates). Defaults to `true`. |
| `ttl_seconds` | integer | no | Suggested TTL hint returned to the client. Defaults to `0` (no hint). |
| `min_confidence` | float | no | Minimum confidence threshold before this skill is selected. Defaults to `0.0`. |

**Example:**
```yaml
---
id: canvas
title: "Cursor Canvas Renderer"
summary: "Render analytical artifacts as live React apps beside the chat window."
version: "2.1.0"
tags: [react, visualization, canvas, charts, tables]
triggers:
  - "make a chart"
  - "render a table"
  - "show data visually"
  - "create a canvas"
  - "interactive visualization"
token_estimate: 1240
ttl_seconds: 1800
---
```

### 3.3 Body Structure Conventions

The body (everything after the front-matter `---` closing) is the injectable content. Conventions:

- **`<!-- internal-only -->` comment block:** Any content inside `<!-- internal-only --> ... <!-- /internal-only -->` is stripped before injection.
- **Section headers:** Use standard Markdown `##` headers. The injector does not restructure headers.
- **Length target:** Aim for 400–1200 tokens (≈ 300–900 words) for a typical skill. Skills over 2000 tokens should be split.
- **Actionable language:** Use imperative instructions. Avoid vague guidance. Bad: "consider using X." Good: "Use X when Y. Do Z before W."

---

## 4. Selector Strategy Interface

The selector is a pluggable module that implements:

```typescript
interface SkillSelector {
  select(
    prompt: string,
    candidates: SkillSummary[],  // Tier 1 data only
    options: SelectOptions
  ): Promise<SelectResult>;

  plan(
    goal: string,
    candidates: SkillSummary[],
    options: PlanOptions
  ): Promise<PlanResult>;
}
```

**Built-in strategies (v1):**

| Strategy ID | Description | Extra deps |
|---|---|---|
| `heuristic` | Tag matching + trigger phrase overlap score | None |
| `embedding` | Local cosine similarity via `@xenova/transformers` | `@xenova/transformers` (Apache 2.0) |
| `llm` | Pass summaries + prompt to a configurable LLM endpoint, parse ranked result | HTTP client only |

**Strategy selection at startup:** Set via `SKILLING_SELECTOR` env var or config file. Default: `heuristic`.

**Heuristic scoring formula:**
```
score(skill, prompt) =
  (exact_trigger_match × 1.0) +
  (partial_trigger_overlap × 0.6) +
  (tag_match_count × 0.3) +
  (title_word_overlap × 0.1)
```
Normalized to [0, 1]. Skills with `score < 0.1` are excluded from results.

---

## 5. Token Budget Enforcement

**Hard limits (not configurable):**
- `MAX_SKILL_BODY_BYTES = 32768` (32 KB) — files larger than this are rejected at load time.

**Soft limits (configurable via env or config):**
- `SKILLING_MAX_INJECT_BYTES` — default `8192` (8 KB). Bodies truncated with a warning if exceeded after shaping.
- `SKILLING_DEFAULT_TOKEN_BUDGET` — default `2048`. Applied to `skill_select` when caller does not specify `token_budget`.

**Budget enforcement in `skill_select`:**
1. Compute `token_estimate` for each candidate (from front matter or auto-computed).
2. Exclude candidates where `token_estimate > token_budget`.
3. If all candidates are excluded, return `{ skill_id: null, reason: "all_candidates_exceed_budget" }`.

**Budget enforcement in `skill_inject`:**
1. After shaping, compute actual byte count of body.
2. If `body_bytes > MAX_INJECT_BYTES`, return error `BODY_TOO_LARGE` with the actual size.
3. Do not partially inject. Either the full shaped body is returned or nothing.

---

## 6. Configuration Schema

Resolved in priority order: environment variables > config file > defaults.

**Config file location:** `Skilling.config.json` in the working directory, or path set by `SKILLING_CONFIG`.

```json
{
  "skillsRoot": "/path/to/skills",
  "selector": "heuristic",
  "maxInjectBytes": 8192,
  "defaultTokenBudget": 2048,
  "ttlSeconds": 1800,
  "log": {
    "level": "info",
    "format": "json"
  },
  "embedding": {
    "model": "Xenova/all-MiniLM-L6-v2",
    "cacheDir": ".skilling-cache"
  },
  "llm": {
    "baseUrl": "http://localhost:11434/v1",
    "model": "llama3",
    "timeout": 10000
  }
}
```

**Environment variable equivalents:**

| Env var | Config key | Default |
|---|---|---|
| `SKILLING_SKILLS_ROOT` | `skillsRoot` | `./skills` |
| `SKILLING_SELECTOR` | `selector` | `heuristic` |
| `SKILLING_MAX_INJECT_BYTES` | `maxInjectBytes` | `8192` |
| `SKILLING_DEFAULT_TOKEN_BUDGET` | `defaultTokenBudget` | `2048` |
| `SKILLING_TTL_SECONDS` | `ttlSeconds` | `1800` |
| `SKILLING_LOG_LEVEL` | `log.level` | `info` |

---

## 7. Error Code Reference

All errors returned as MCP error objects with a `code` field (string) and `message` field (human-readable).

| Code | When |
|---|---|
| `STORE_UNAVAILABLE` | Skill root cannot be read at all |
| `SKILL_NOT_FOUND` | `skill_inject` called with an id that doesn't exist in the store |
| `BODY_TOO_LARGE` | Body after shaping exceeds `MAX_INJECT_BYTES` |
| `INVALID_FRONT_MATTER` | Skill file has unparseable YAML front matter |
| `PATH_ESCAPE` | Resolved path for a skill file escapes the skill root |
| `CORRELATION_UNKNOWN` | `skill_cleanup` called with an unrecognized id (returns `ok: true`, not this error) |
| `BUDGET_EXCEEDED` | All candidates exceed the requested `token_budget` |
| `SELECTOR_ERROR` | The selector strategy threw an unhandled error |

---

## 8. Observability Contract

**Log fields on every request:**

```json
{
  "ts": "2026-05-20T11:00:00Z",
  "tool": "skill_inject",
  "skill_id": "canvas",
  "correlation_id": "abc123",
  "token_estimate": 1240,
  "duration_ms": 12,
  "ok": true
}
```

**Never log:**
- Full prompt or goal strings (unless `SKILLING_LOG_PROMPTS=true` is explicitly set).
- Skill bodies.
- User file contents.

**Health check:** A GET to `/health` (HTTP transport) or a `skill_list` call (stdio) that completes without error indicates the server is healthy.

---

## 9. Versioning and Stability

- **MCP tool names and required input/output fields** are stable once v1.0 ships. Additions are non-breaking; removals require a major version bump.
- **Skill file format** front-matter fields marked "required" are stable. New optional fields may be added at any time.
- **Configuration keys** are stable once v1.0 ships. New optional keys may be added.
- **Internal APIs** (selector interface, store internals) may change between minor versions during the pre-1.0 period.
