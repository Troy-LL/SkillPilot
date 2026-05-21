# Skilling editor extension (TTL / lifecycle)

> **Sprint C:** Initial implementation lives in **`extension/`** — see **`docs/EXTENSION.md`**.

# Follow-up notes (original sketch)

## Problem

The MCP server returns structured hints (`ttl_ms`, `correlation_id`) on **`load`**, and **`cleanup`** should run when a skill fragment is dropped from the agent context. Today that lifecycle is entirely **manual** in the host: easy to forget `cleanup` or to keep injected skill text longer than intended.

## Proposed extension (sketch)

1. **VS Code / Cursor extension** that:
   - Subscribes to MCP tool results from the Skilling server (or wraps calls if the host exposes hooks).
   - When `load` returns, starts a **timer** using `ttl_ms` (server hint; client may clamp).
   - Shows a **non-blocking status** or notification: “Skill `x` active — auto-clear in N min.”
   - On expiry, prompts or automatically clears the **local** ephemeral system fragment / scratch buffer the extension manages (without mutating unrelated host state).
2. **Idempotent `cleanup`** — extension should call `cleanup` with the stored `correlation_id` on timer fire and on window unload; duplicates must not surface as errors (already guaranteed by v1 server).
3. **Settings** — user-tunable default TTL override, enable/disable auto-cleanup, optional “always prompt before clear.”

## Out of scope for v1

- No webview or marketplace packaging in this repo yet.
- No change to MCP protocol — only client UX and automation.

## Acceptance criteria (future PR)

- Extension loads in VS Code and Cursor using the same `mcp.json` / `mcp` config pattern as documented.
- After `load`, user-visible countdown or badge; after TTL, `cleanup` invoked once unless user dismisses skill early.
- Documented failure mode: if MCP disconnects, clear local timers and do not spam `cleanup`.
