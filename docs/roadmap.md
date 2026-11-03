---
id: aw-photo-roadmap
title: AW Photo — Roadmap
type: roadmap
status: active
project: aw-photo
created_at: 2026-05-20T17:19:00Z
updated_at: 2026-05-20T17:19:00Z
tags:
  - roadmap
  - milestones
  - stax-fleet
---

# 🗺️ AW Photo — Roadmap

## Phase 1 — Foundation (Core Infrastructure)
- [ ] Scaffold Flask app with SQLite context manager
- [ ] Define and migrate core database schema (`Photo`, `BlogPost`, `DigitalProduct`, `Order`, `StorageLocation`)
- [ ] Build `public/index.html` shell with dark-mode HSL CSS design system
- [ ] Set up `public/outputs/` asset directory structure

## Phase 2 — Blog & Editorial
- [ ] Blog post list and detail pages (Vanilla JS rendered from Flask API)
- [ ] Admin endpoint to create/edit blog posts (markdown body)
- [ ] SEO meta tags and structured heading hierarchy per post

## Phase 3 — Print Storefront
- [ ] Photo gallery with collection grouping and edition tracking
- [ ] Individual photo detail page with print size/paper options
- [ ] POD fulfillment adapter (Printful or Printify) behind Flask route
- [ ] Basic order record creation on purchase

## Phase 4 — Digital Asset Storefront
- [ ] Digital product listing page
- [ ] Secure download delivery (signed URL or token-gated route)
- [ ] Email capture / lead magnet flow for free preset pack

## Phase 5 — Polish & Launch
- [ ] Newsletter integration (email sign-up → list)
- [ ] Homepage with hero, featured collection, latest blog post, and asset teaser
- [ ] Responsive grid audit — narrow viewport passes
- [ ] Payment integration (Stripe) wired through Flask backend
