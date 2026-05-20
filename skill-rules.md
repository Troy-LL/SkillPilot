# Skill naming and metadata rules (SkillPilot)

Authoritative rules for **canonical skill identity**, **metadata**, and **store behavior**. Aligns with `architecture.md` (skill store contract, list/load, validation). Implementations **must reject** skills that violate these rules at **index or load time** (fail closed).

---

## 1. Terms

| Term | Meaning |
|------|--------|
| **Skill root** | Configurable directory (default **`.agents/skills/`** in this repo); no skill file resolves outside it. |
| **Primary document** | The injectable file (e.g. `SKILL.md` or `*.skill`) that carries body + front matter. |
| **`skill_id`** | Stable, unique machine identifier used in APIs, logs, TTL maps, and `load(skill_id)`. |
| **Title** | Human-facing label; not used as the canonical API id. |

---

## 2. Canonical `skill_id`

### 2.1 Character set

- **Allowed characters:** ASCII lowercase letters `a-z`, digits `0-9`, and **single** hyphens `-` as separators.
- **Disallowed:** spaces, underscores, uppercase, dots, slashes, Unicode idempotents, emoji, consecutive hyphens, leading/trailing hyphens.

**Normative pattern (regex):**

```text
^[a-z0-9]+(-[a-z0-9]+)*$
```

### 2.2 Length

- **Minimum:** 3 characters.  
- **Maximum:** 64 characters (inclusive), measured after normalization.

### 2.3 Reserved and namespacing (recommended)

- Prefer **reverse-domain style prefixes** for third-party or mirrored skills to avoid collisions, e.g. `com-example-team-oncall` or short stable prefix `acme-oncall` (still must match the charset above; hyphens only).
- Do not use ids that differ only by trivial prefixes unless they represent distinct skills (avoid `foo` vs `foo-skill` for the same content).

### 2.4 Normalization

- If an ingest pipeline accepts upstream slugs with uppercase or underscores, **normalize** to the rules above before storage; **do not** silently keep duplicate semantics under two ids.

---

## 3. Uniqueness

- **`skill_id` must be globally unique** across the entire skill root (all namespaces and subfolders).
- **Duplicate ids:** invalid store — `list` / full index must **error** or **exclude** the entire conflicting set until resolved (never pick one arbitrarily).
- **Derived ids:** If `skill_id` is derived from a folder name, that folder name must obey the same charset and length rules as `skill_id`.

---

## 4. Stability

- **`skill_id` is immutable** for the lifetime of that skill’s meaning. Editorial changes go to **title**, **summary**, **tags**, **body**, or **`version`** — not to renaming the id.
- **Renaming a skill** = deprecate the old id (document in manifest or changelog) and introduce a **new** id; do not reuse the old id for unrelated content within a short window (prefer: never reuse).

---

## 5. Collision policy

| Situation | Policy |
|-----------|--------|
| Two primary documents declare the same `id` | **Reject** both from load; surface a clear validation error at index time. |
| `id` in front matter disagrees with folder-derived id (if you use both) | **Reject** unless a single declared source of truth is documented and the other is absent. |
| Import from upstream reuses an existing id with different content | **Fail import** unless explicit **`id_override`** (human-approved) or version bump workflow is recorded; no silent overwrite. |
| Case-only collision after normalization | Treated as **duplicate**; reject. |

---

## 6. Metadata schema (required vs optional)

All fields below refer to **YAML front matter** on the primary document **or** an equivalent sidecar manifest that the loader merges before validation.

### 6.1 Required

| Field | Type | Rules |
|-------|------|--------|
| `id` | string | Matches §2 (charset, length). |
| `title` | string | 1–120 chars; human readable; any sensible Unicode allowed in title **if** your parser supports UTF-8; keep control characters out. |
| `summary` | string | 1–300 chars; one line; no markdown headings; used for list/rank UIs. |

### 6.2 Optional (recommended for v1 selectors)

| Field | Type | Rules |
|-------|------|--------|
| `tags` | string array | Lowercase `a-z`, `0-9`, hyphens; each tag 2–32 chars; max **20** tags per skill. |
| `triggers` | string array | Short phrases or glob patterns per selector strategy; max length and count TBD by implementation with a hard cap (suggest: 10 triggers, 64 chars each). |
| `version` | string | Semver `1.2.3` or opaque `2025-05-14` string; not a second id. |
| `clients` | string array | e.g. `cursor`, `vscode` — filter for host hints; same tag charset as `tags`. |

### 6.3 Forbidden in front matter for injection safety

- Executable directives, HTML, or binary blobs in metadata values.
- Keys that instruct the host to run code (skills are **data**; execution stays in the host per `architecture.md`).

---

## 7. Primary document and layout

- **One canonical primary document per `skill_id`** under the skill root.
- **Suggested layout:** `{skill_root}/{skill_id}/SKILL.md` so folder name reinforces id (still validate `id` in file matches path if you adopt this).
- **Sibling files** (examples, checklists) only via **relative** paths under the same skill directory; no `..` segments.
- **Encoding:** UTF-8. **No BOM** preferred for consistency.

---

## 8. Body (injectable content)

- **Format:** Markdown or plain text only for the injectable body.
- **Size cap (recommended):** entire primary document **≤ 256 KiB**; injectable body after front matter stripping **≤ 192 KiB** (tune per product; document final numbers in server config).
- **Reject:** binary content, null bytes, or path escape tricks in resolved includes.

---

## 9. Security and path rules

- Resolve all reads **only** under the configured skill root; **deny** `..`, absolute paths outside root, and symlink escape if the platform allows it.
- **Logging:** log `skill_id`, correlation id, and version — **not** full bodies or full user prompts unless policy explicitly allows.

---

## 10. External repos and ingestion

- Upstream repos **do not** need to match these rules; **your pipeline or curated copy** must produce a compliant skill before it enters the skill root.
- Maintain optional **`source`** metadata (non-authoritative): URL + commit SHA for audit; not used as `skill_id`.

---

## 11. API-facing consistency

- **`list`** returns: `id`, `title`, `summary`, optional `tags`, optional `version`.  
- **`load`** accepts only **`skill_id`** as defined here; invalid id → structured error, no partial body.  
- **`cleanup` / extension TTL** keys off correlation ids from the server response; `skill_id` remains the stable skill reference.

---

## 12. Versioning and “latest”

- Prefer **pinned `version`** in manifests for reproducible QA.
- If the product exposes “latest” for an id, document that **content may change** without id change, and that CI should re-validate on every bump.

---

## 13. Change control

- Any change to §2–§6 (charset, length, required fields) is a **breaking change** for clients — bump a **schema version** in the router and in this document’s header when you do.

---

*Document version: 1.0 — SkillPilot skill store rules.*
