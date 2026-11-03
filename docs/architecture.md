---
id: aw-photo-architecture
title: AW Photo — Architecture
type: spec
status: active
project: aw-photo
created_at: 2026-05-20T17:19:00Z
updated_at: 2026-05-20T17:19:00Z
tags:
  - architecture
  - flask
  - sqlite
  - stax-fleet
---

# 🏗️ AW Photo — Architecture

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Backend | Python / Flask | Lightweight REST API |
| Database | SQLite | Local SoR, parameterized queries via context manager |
| Frontend | HTML5 + Vanilla ES6 JS | Modular, no bundler required |
| Styling | Custom HSL CSS | Outfit + JetBrains Mono fonts, dark mode glassmorphism |
| Asset Storage | `public/outputs/` | Local-first, structured by type |
| POD Fulfillment | Printful / Printify | Abstract adapter behind Flask route |
| Payments | Stripe | Server-side only, never client-side keys |

---

## Directory Structure

```
aw-photo/
├── AGENTS.md               # AI agent runbook
├── README.md               # Navigational index (sparse)
├── requirements.txt        # Python dependencies
├── docs/                   # Specs and operating documents
│   ├── product-brief.md
│   ├── roadmap.md
│   ├── architecture.md
│   └── data-model.md
├── public/                 # Client-side files
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── app.js
│   └── outputs/            # Generated / uploaded assets
│       ├── prints/
│       ├── presets/
│       └── guides/
└── src/                    # Server-side Flask logic
    ├── app.py              # Flask factory and route registration
    ├── db.py               # SQLite context manager
    ├── schema.sql          # Table definitions and indexes
    ├── routes/
    │   ├── photos.py
    │   ├── blog.py
    │   └── products.py
    └── adapters/
        └── fulfillment.py  # Abstract POD adapter base class
```

---

## Request Flow

```
Browser → public/index.html (Vanilla JS)
         ↓ fetch()
src/app.py (Flask REST API)
         ↓
src/db.py (SQLite context manager)
         ↓ parameterized query
SQLite DB (local file)
```

All external calls (Printful, Stripe) originate from `src/adapters/` — **never from the browser**.
