# SkillPilot V1 exceptions

Authoritative **V1 MVP** relaxations and defaults. Where this file is silent, `skill-rules.md` and `architecture.md` apply.

## 1. Scope

v1 ships a **stdio MCP server** with tools **`list`**, **`select`** (heuristic only), **`ingest`**, **`load`**, **`cleanup`**, plus Sprint E lifecycle tools **`begin_task`**, **`end_task`**, and **`get_session`**, over a local filesystem skill store. Episode state is also written to **`.skillpilot/session.json`** at the repo root (gitignored) for extension and future hooks. There is **no** LLM-assisted ranking, no embedding index, and no remote store sync in this release.

## 2. Metadata handling

- **Required** in YAML front matter on `SKILL.md`: `id`, `title`, `summary` (per `skill-rules.md` §6.1).
- **Optional** when present: `tags`, `version`, `clients` (validated per `skill-rules.md` §6.2).
- **Unknown keys** in front matter are **ignored** for forward compatibility (v1 metadata exception).

## 3. Layout id vs front matter id (exception 9 — strict default)

Layout is **`{skill_root}/{skill_id}/SKILL.md`**. The directory name under the skill root is the **folder-derived id**.

**V1 default (strict):** if the YAML `id` field **does not exactly equal** the parent folder name, the skill is **rejected** at index time and cannot be loaded. There is no alternate source of truth in v1.

## 4. Size caps

v1 follows **`skill-rules.md` §8 exactly**:

| Limit | Value |
|--------|--------|
| Entire primary document (`SKILL.md` file on disk) | **≤ 256 KiB** |
| Injectable body after front matter is stripped | **≤ 192 KiB** |

Files exceeding either cap, containing **NUL** bytes, or non‑UTF‑8 decode failures are **rejected**.

## 5. Symlinks

Path confinement uses **`realpath`** / canonical resolution **where the platform supports it** (best-effort). If resolution succeeds and the target lies **outside** the configured skill root, access is **denied**. If resolution fails (e.g. missing path before read), validation still applies to the resolved candidate path under the root.

## 6. `cleanup` tool

A **`cleanup`** tool is provided (architecture: idempotent release). Repeated calls with the same `correlation_id` **succeed** without error. The v1 server keeps **minimal** optional bookkeeping for returned correlation ids; hosts remain responsible for **TTL** policy per `architecture.md`.

## 7. Editor extension (Sprint C)

A minimal **SkillPilot Lifecycle** extension ships under **`extension/`** (command-based register + TTL + MCP `cleanup`). It does **not** auto-hook agent `load` calls. See **`docs/EXTENSION.md`**. Acceptance criteria and future hooks: **`docs/FOLLOWUP-extension.md`**.
