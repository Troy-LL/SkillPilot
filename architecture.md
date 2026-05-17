# Skill Router MCP — Architecture

This document is the text counterpart to `skill_router_architecture.svg`. It states what the diagram shows, then fills in processes and boundaries that a diagram alone cannot carry.

## Purpose (one sentence)

An MCP server acts as a **universal skill router**: any MCP-compatible host (IDE agents, desktop assistants, custom CLIs, or other tools) connects, sends a **prompt / goal / context**, receives the **right skill text** formatted as a **system-prompt addition**, applies it for the current task, then **evicts** that addition so the next turn is not polluted.

The host remains responsible for **how** system prompts are merged; the router is responsible for **which** skill body to return and **when** it should be considered active vs cleared.

---

## What the SVG encodes (essence)

### Columns in the diagram

1. **Clients** — Examples shown: Cursor / Windsurf, Claude Desktop, a custom CLI agent, and generically “any MCP client.” All speak MCP to the same server.
2. **MCP server (“Skill Router”)** — Exposes capabilities named in the diagram as conceptual operations:
  - `skill_select(prompt)` — choose a skill from the candidate set.
  - `skill_inject(name)` — load body and return it as the injectable system-prompt fragment.
  - `skill_cleanup()` — signal end-of-use so the client can drop the fragment from context.
  - `skill_list()` — discovery / introspection of available skills.
3. **Selector** — The diagram labels this as picking the “best-fit” skill. It sits between routing logic and the skill store.
4. **Skill store** — Local filesystem under a configurable root (diagram: `~/skills/`), files such as `*.skill` or `SKILL.md`.
5. **Lifecycle (per request)** — Numbered flow: receive → select → inject → agent uses skill → cleanup, with a dashed path indicating the **injected system prompt is returned to the calling agent**.

### Data / control flow (narrative)

- **Inbound**: Client sends prompt + goal + optional context over MCP (typically a tool call or equivalent RPC defined by your server).
- **Selection**: The selector scores or ranks candidates (diagram wording: “Claude scores candidates”; see **Pluggable selector** below for a dependency-light view).
- **Outbound**: The server returns skill text meant to be merged into the **system** instructions for that task only.
- **Execution**: The calling agent runs the user task with that extra system material.
- **Cleanup**: After the task (or session slice), the client removes the addition so later work does not inherit stale procedures.

---

## Pluggable selector (avoid hard coupling)

The diagram names a specific model family for the selector. In implementation, treat **selection** as a **strategy** behind one interface so QA surface stays small when swapping implementations:


| Strategy                 | When it fits                                                                                      | Dependency posture                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Heuristic / rules**    | Skills declare tags, globs, or triggers in front matter; match keywords or paths from the prompt. | Minimal: parsing + string rules only.                  |
| **Embedding similarity** | Optional local vector compare if you add an embedding step later.                                 | Adds a model dependency only if you turn it on.        |
| **LLM-assisted ranking** | Model reads short skill summaries and returns one id.                                             | One HTTP/API dependency, isolated behind the strategy. |


Defaulting to **rules + metadata** keeps the core router usable even when external APIs are down.

---

## MCP surface (conceptual)

Exact tool names are your product choice; architecturally you need:

- **List** — Enumerate skill ids, titles, and one-line descriptions (for UIs and for debugging).
- **Select / resolve** — Input: user goal + prompt (+ optional workspace hints). Output: chosen `skill_id`, optional rationale, optional warnings (e.g. low confidence).
- **Load** — Input: `skill_id`. Output: canonical **skill body** (markdown or plain text) sized for system injection.
- **Release / cleanup** — Input: correlation id or session id. Output: ack. Tells the client it may drop the injected fragment; optionally idempotent.

Hosts that cannot mutate system prompts dynamically may instead treat the fragment as a **prepend** to the next user message; the router should still return **structured** fields (`skill_id`, `body`, `ttl_hint`) so clients stay simple.

---

## Skill store contract

- **Root**: Configurable directory (filesystem path or URI), not hard-coded to a home folder in production.
- **Artifacts**: One primary document per skill (`SKILL.md`, `*.skill`, or similar). Optional sibling files (examples, checklists) referenced relatively.
- **Metadata**: Front matter or a small manifest per skill: `id`, `title`, `summary`, `tags`, optional `triggers`, optional `version`.
- **Validation at load time**: Reject oversize bodies, binary content, or path escapes (`..` segments). Keeps injection safe and predictable.
- **Versioning**: Prefer immutable skill versions referenced by id; allow “latest” only if you accept churn in QA.

---

## Per-request lifecycle (expanded)

1. **Receive** — Normalize inputs (encoding, max length), attach a **correlation id** for this inject/cleanup pair.
2. **Discover candidates** — From store: all skills, or a filtered subset from tags / workspace path rules.
3. **Select** — Strategy returns `skill_id` + confidence; define behavior on ties and on “no match” (return empty, or a generic “safe default” skill).
4. **Authorize** — If skills can contain sensitive instructions, enforce **which clients or workspaces** may load which namespaces (optional but important for shared machines).
5. **Load & shape** — Read file, strip non-injectable sections if needed, optionally wrap with a short header (“Following skill applies only to this task…”).
6. **Respond** — Return payload to client with merge hints (`role: system`, `ephemeral: true`, `correlation_id`).
7. **Client executes** — Host merges into system stack or equivalent; user task runs.
8. **Cleanup** — On explicit `cleanup` call, task completion hook, or TTL expiry: client removes fragment; server may delete any **server-side ephemeral state** keyed by correlation id (caches, temp files — if any).

Steps 4–6 are the usual gaps omitted from a single diagram.

---

## Session and concurrency semantics

- **Idempotent cleanup**: Calling cleanup twice should not error.
- **Overlapping requests**: If one client issues concurrent selects, each correlation id must isolate injected state so responses do not cross streams.
- **Long-running tasks**: If the host cannot call cleanup, use a documented **TTL** after which the skill is treated as inactive (client-side policy is enough if the server is stateless).

---

## Security and abuse resistance

- **Path confinement**: Resolve skill paths only under the configured root; deny symlink escape if the OS allows it.
- **Size limits**: Cap file size and total injected bytes per response.
- **No arbitrary code execution from skills**: Skills are **data** (text). Any “run shell” behavior belongs in the host agent, not in the router process, unless you deliberately add a sandboxed executor (out of scope for a minimal router).
- **Logging**: Log `skill_id` and correlation id, not full user prompts, unless policy allows — reduces leak surface and log cost.

---

## Observability (lightweight)

- **Metrics**: Count selects, loads, cleanups, errors, empty selections; histogram of body sizes.
- **Tracing**: Propagate correlation id through select → load → cleanup in logs.
- **Health**: Read-only check that the skill root is readable and manifests parse.

All of the above can be stdout logs in v1; no metrics library is required.

---

## Failure modes (explicit)


| Failure                         | Desired behavior                                                          |
| ------------------------------- | ------------------------------------------------------------------------- |
| Skill file missing after select | Return structured error; do not partially inject.                         |
| Selector returns unknown id     | Validate against store before respond.                                    |
| Store unreadable                | Degraded mode: `skill_list` errors clearly; select returns “unavailable”. |
| Client never calls cleanup      | Client policy TTL; server remains correct if stateless.                   |


---

## Dependency philosophy (aligned with project goals)

- **Mandatory**: MCP transport as required by the host; **stdio or stream** per MCP conventions; **filesystem** for the store.
- **Optional, behind interfaces**: LLM-based ranking, embedding index, remote store sync.
- **Avoid**: Deep stacks (heavy web frameworks, ORMs, plugin registries) inside the router process — each layer multiplies QA when behavior drifts.

Keeping the router **stateless** between calls (aside from reading files) minimizes moving parts: no database requirement for v1, no background workers unless you add cache warming deliberately.

---

## Relation to the visual diagram

- **Solid arrows** — Normal request path: clients → Skill Router; Router → selector; selector → skill store; Router ↔ lifecycle column (conceptual alignment with per-request steps).
- **Dashed arrows** — Emphasis that the **injectable system prompt** is the **return value** to the calling agent, not a hidden side channel.

For the authoritative graphic, see `skill_router_architecture.svg`.