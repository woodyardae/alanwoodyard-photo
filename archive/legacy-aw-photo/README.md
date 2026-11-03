# DEPRECATED

> [!WARNING]
> ### ⚠️ REPOSITORY CONSOLIDATED & DEPRECATED
> This repository has been consolidated into the unified [**`stax-sites`**](https://github.com/woodyardae/stax-ghost) monorepo under `sites/site-aw-photo`.
> All active development, issues, and PRs now occur in **`stax-sites`**. This standalone repository is archived and read-only.

---
id: aw-photo-readme
title: AW Photo
type: orientation
status: active
project: aw-photo
created_at: 2026-05-20T17:19:00Z
updated_at: 2026-05-20T17:19:00Z
tags:
  - orientation
  - documentation
  - stax-fleet
---

# 📸 AW Photo


> [!IMPORTANT]
> **🤖 FOR AI AGENTS, CODING COMPANIONS, AND AUTOMATED SYSTEMS:**
> This repository is governed by the **STAX Operating System**. Before taking *any* action, analyzing files, or proposing modifications, you **must** read and strictly adhere to:
> 1. [ops/soul.md](ops/soul.md) (Philosophical Compass)
> 2. [ops/agent-rules.md](ops/agent-rules.md) (Enforceable Rules & the 7-Step Sequence)
>
> You are required to run through the **Inventory ➔ Summarize ➔ Classify ➔ Propose ➔ Implement ➔ Update Docs ➔ Archive Leftovers** sequence for every run.



A photography sales, editorial blog, and digital asset storefront. Sells prints, interviews photographers, and offers presets and downloads for purchase.

Part of the **STAX app fleet**. Root is kept sparse — all detail lives in `/docs` and `AGENTS.md`.

---

## 🧭 Navigation

- **[AGENTS.md](./AGENTS.md)**: AI agent runbook, coding rules, style directives.
- **[docs/product-brief.md](./docs/product-brief.md)**: Platform purpose, sales strategy, blog concept, and asset storefront goals.
- **[docs/roadmap.md](./docs/roadmap.md)**: Development milestones.
- **[docs/architecture.md](./docs/architecture.md)**: Flask + Vanilla JS stack details.
- **[docs/data-model.md](./docs/data-model.md)**: SQLite schema for blog posts, products, and orders.

---

## 🛠️ Stack at a Glance

- **Backend**: Python / Flask (REST API)
- **Database**: SQLite (local, zero-cost, single source of truth)
- **Frontend**: HTML5 + Vanilla JS (dark mode, glassmorphism UI)
- **Assets**: Served from `public/outputs/`

## Lifecycle & Governance

| Field | Value |
|---|---|
| Lifecycle State | Staged-Shell (Waiting) |
| Security Tier | Strong |
| Governance | `.orchestration/agent-instructions.md` |

This repo follows STAX governance. See `.orchestration/` for operating rules, safe-task tiers, and the AI audit log. It is a deliberate staged shell — no active development until the ss- fleet direction is decided.
