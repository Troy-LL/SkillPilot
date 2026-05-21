# Skilling — Philosophy

> "A skill injected is a debt paid in tokens every step. A skill well-chosen is a force multiplier. A skill evicted on time is hygiene."

This document captures the *why* behind Skilling's design choices. It is meant to be read before contributing, before making architectural decisions, and before adding new features. When two approaches seem equivalent on paper, the one that aligns with this philosophy wins.

---

## 1. Skills Are Scaffolding, Not Load-Bearing Walls

Agent skills exist to guide behavior during a task. They are transient scaffolding, not permanent infrastructure. The moment a task ends, the scaffolding should come down. An injected skill that lingers in context is wasted tokens — at best noise, at worst a source of stale guidance that corrupts unrelated tasks.

**What this means in practice:**
- Every injection has a corresponding cleanup path. There is no "permanent skill injection."
- The MCP tool surface makes cleanup a first-class operation, not an afterthought.
- Skills are sized to be useful for one task slice, not written as comprehensive manuals.

---

## 2. Token Cost Is a User Experience Problem

Context windows are not free. Every token injected into a system prompt is a token that cannot be used for task history, user messages, or model reasoning. Research on skill-augmented agents (see [Skill0, arXiv:2604.02268](https://arxiv.org/abs/2604.02268)) shows that naïve full-skill injection can cost 2–5× more tokens per step than a filtered, summary-first approach — while actually *hurting* performance due to retrieval noise.

Skilling treats token efficiency as a first-class design constraint, on par with correctness:
- Selection uses summaries (≤ 60 tokens per skill), never full bodies.
- Full bodies are loaded only after a skill has been selected.
- Token budgets are configurable and enforced before injection.
- Skills that do not match the current task are silently dropped — never returned as a "safe default dump."

**The goal:** an agent using Skilling should spend *fewer* total tokens per task than an agent doing manual skill management, while achieving better task alignment.

---

## 3. Open Source, No Exceptions

Skilling is built to be used by anyone, anywhere, without accounts, API keys, or proprietary binaries. This is a hard constraint, not a preference:

- Every runtime dependency must have an open license (MIT, Apache 2.0, BSD, or equivalent).
- The core router must work with zero network calls — local filesystem is the only mandatory dependency beyond MCP transport.
- Optional capabilities (embedding-based selection, LLM-assisted ranking) are additive and isolated. Enabling them should not require signing up for any service.
- If a better dependency exists but is proprietary, we build or adopt an open alternative. We do not make exceptions "just this once."

This constraint keeps the project usable in air-gapped environments, enterprise settings with strict vendor policies, and for users who simply value software freedom.

---

## 4. Stateless by Default

The router holds no state between calls beyond reading files. There is no database, no background worker, no in-memory cache that can drift from disk. This has several consequences:

- The server can be restarted at any time without data loss.
- Multiple instances can run concurrently without coordination.
- There is no "warm-up" period — the router is ready the moment the skill root is readable.
- Bugs cannot hide in accumulated state; every request is fresh.

When caching is added for performance, it must be:
- Explicitly opt-in.
- Safe to flush at any time without correctness consequences.
- Documented as an optimization, not a correctness requirement.

---

## 5. Minimal Surface, Maximal Composability

Skilling exposes a small number of well-defined tools. It does not try to be a skill editor, a skill evolution system, a training pipeline, or a memory store. Those are valuable problems, but they belong in separate, composable tools.

The MCP surface is deliberately narrow:
- `skill_list` — discovery
- `skill_select` — routing
- `skill_inject` — loading
- `skill_cleanup` — eviction
- `skill_plan` — planning

Any feature that cannot be expressed through these five operations (or a considered extension of them) should be a separate MCP server or a separate tool that calls these.

This philosophy makes Skilling easy to audit, easy to test, and easy to integrate. It also means that when something goes wrong, the scope of the problem is small.

---

## 6. Plan Before You Execute

One of the most common sources of mid-task context thrash is discovering — halfway through a complex task — that a different skill was needed, or that the task requires multiple skills in a specific order. This forces re-planning inside an already-loaded context, wasting both tokens and coherence.

Skilling's `skill_plan` tool exists specifically to front-load this reasoning. Before injecting any skill body, the agent can ask: *"What skills will I need for this goal, and in what order?"* The planner reads only Tier 1 summaries (cheap) and returns a structured plan. The agent can then make an informed decision about scope before the expensive Tier 2 loads happen.

**This is not mandatory.** For simple tasks, `skill_select` + `skill_inject` is the right path. But for complex multi-step work, planning first is almost always worth the upfront cost.

---

## 7. Heuristics First, Models When Justified

The default selector is rule-based: tags, glob patterns, and trigger phrases in skill front matter matched against the incoming prompt. This is deterministic, fast, requires no model calls, and is easy to debug.

Adding an embedding model or LLM ranker improves selection quality in ambiguous cases, but it introduces:
- Latency
- A new dependency
- A new failure mode
- A harder debugging surface

We add these capabilities only when the rule-based selector demonstrably fails at a use case that matters, and we add them behind the strategy interface so the rules-only path remains available and tested.

**Default is not a limitation.** The heuristic selector, with well-written skill front matter, handles the majority of real-world selection cases correctly.

---

## 8. Fail Loudly on Safety, Fail Gracefully on Availability

Security failures (path traversal, oversized injection, binary content) are errors. The router should reject them loudly and return a structured error with a clear reason.

Availability failures (skill not found, selector returns no match, store temporarily unreadable) should degrade gracefully:
- No match → empty response, not a dump of everything.
- Skill missing after select → structured error, not a partial injection.
- Store unreadable → `skill_list` errors clearly; `skill_select` returns `unavailable`.

The agent calling Skilling should always be able to proceed — either with a skill or with a clear signal that no skill was found. It should never receive a response that silently poisons its context.

---

## 9. The Skill Format Is Documentation

A well-written skill is documentation that happens to be machine-routable. The `summary` field is a one-sentence answer to "what does this skill do and when should I use it?" The `triggers` are phrases a human would naturally write when they need this skill.

Skills written as internal-only jargon, as walls of text, or without a `summary` are bad skills. The skill format enforces a minimum structure, but quality is a community norm:
- Summaries must be human-readable sentences, not tag dumps.
- Bodies should be as short as they can be while remaining actionable.
- Trigger phrases should reflect how users actually describe the task, not how engineers name the skill.

---

## Summary Table

| Principle | What it rules out |
|---|---|
| Skills are transient scaffolding | Permanent injection, ever-growing system prompts |
| Token cost is UX | Injecting all skills on every call, ignoring body size |
| Open source, no exceptions | Proprietary dependencies "just this once" |
| Stateless by default | Background workers, in-memory state that can drift |
| Minimal surface | Scope creep into skill editing, training, or memory |
| Plan before executing | Mid-task context thrash on complex goals |
| Heuristics first | Defaulting to LLM calls for simple tag matching |
| Fail loudly on security | Silent path-escape or oversized injection |
| Skill format is documentation | Undocumented or jargon-heavy skills |
