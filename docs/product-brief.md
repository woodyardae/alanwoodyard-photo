---
id: aw-photo-product-brief
title: AW Photo — Product Brief
type: spec
status: active
project: aw-photo
created_at: 2026-05-20T17:19:00Z
updated_at: 2026-05-20T17:19:00Z
tags:
  - product
  - brief
  - photography
  - stax-fleet
---

# 📸 AW Photo — Product Brief

## Purpose

`aw-photo` is a photography commerce and editorial hub with three revenue streams:

1. **Print Sales** — Curated photography collections sold as fine-art physical prints via POD fulfillment (Printful/Printify).
2. **Interview Blog** — An editorial series profiling photographers who shoot unusual or compelling subjects (extreme environments, niche wildlife, macro, astrophotography, street, etc.). Each interview drives audience cross-pollination and organic SEO traffic.
3. **Digital Asset Storefront** — Downloadable presets (Lightroom/Capture One), PDF guides, textures, and light leaks sold as one-time purchases.

---

## Value Loop

The three pillars reinforce each other:
- Blog interviews bring the interviewee's audience to the site → they discover prints and presets.
- Free preset lead magnets (offered in exchange for email sign-up) build the newsletter list.
- Newsletter drives repeat print sales and new product launches.

---

## Print Sales Strategy

- Organize work into **named thematic collections** (not a flat gallery dump).
- Use **limited edition numbering** to create urgency and justify premium pricing.
- Fulfillment via Printful or Printify, triggered through the Flask backend — never client-side.
- Fine-art paper and canvas options; no cheap merchandise.

---

## Blog Strategy

- **Editorial angle**: Photographers who shoot *interesting things* — the subject and the photographer's story are equal parts of each post.
- **Format**: Long-form Q&A with embedded images, gear lists, and location notes.
- **SEO**: Posts target long-tail keywords around specific techniques, gear, and locations covered in each interview.
- **Cadence**: Aim for 2 posts/month at launch.
- **First 5 interview targets**: TBD by operator.

---

## Digital Asset Strategy

- **Presets**: Bundle Lightroom/Capture One presets used in operator's own work, organized by genre/mood.
- **PDF Guides**: "Lighting for Macro", "Street Photography Checklist", "Print Sizing Guide", etc.
- **Textures/Overlays**: Light leaks, grain overlays, sky replacements for other creators.
- **Lead Magnet**: Free mini-preset pack gated behind email sign-up.
- **Pricing**: One-time purchase only. No subscriptions.

---

## Anti-Subscription Philosophy

All digital products are sold as **one-time purchases**. No membership tiers, no SaaS fees.

---

## POD Integration

Fulfillment connects to `the_sweatshop` (adventures-of-sparky-and-claw) POD automation flows where possible to reuse existing Printful/Printify adapter infrastructure.
