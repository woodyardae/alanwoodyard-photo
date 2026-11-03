---
id: aw-photo-data-model
title: AW Photo — Data Model
type: spec
status: active
project: aw-photo
created_at: 2026-05-20T17:19:00Z
updated_at: 2026-05-20T17:19:00Z
tags:
  - data-model
  - sqlite
  - schema
  - stax-fleet
---

# 🗄️ AW Photo — Data Model

All tables reside in a single local SQLite file. The database is the absolute system of record.

---

## `photos`

Represents a sellable photographic image.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `title` | TEXT NOT NULL | Display name |
| `slug` | TEXT UNIQUE | URL-safe identifier |
| `description` | TEXT | Long-form description |
| `category` | TEXT | e.g. `landscape`, `macro`, `street` |
| `collection` | TEXT | Named thematic collection |
| `file_path` | TEXT NOT NULL | Path under `public/outputs/prints/` |
| `edition_size` | INTEGER | NULL = open edition |
| `edition_sold` | INTEGER DEFAULT 0 | Running count of sold copies |
| `price_usd` | REAL NOT NULL | Base price in USD |
| `active` | INTEGER DEFAULT 1 | 1 = listed, 0 = unlisted |
| `created_at` | TEXT | ISO 8601 timestamp |

---

## `blog_posts`

Represents an interview or editorial article.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `title` | TEXT NOT NULL | Post title |
| `slug` | TEXT UNIQUE | URL-safe identifier |
| `author` | TEXT | Byline |
| `body_md` | TEXT | Full post body in Markdown |
| `featured_image` | TEXT | Path to hero image |
| `published` | INTEGER DEFAULT 0 | 1 = live |
| `published_at` | TEXT | ISO 8601 timestamp |
| `created_at` | TEXT | ISO 8601 timestamp |

---

## `digital_products`

Represents a downloadable asset for sale.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `name` | TEXT NOT NULL | Display name |
| `slug` | TEXT UNIQUE | URL-safe identifier |
| `type` | TEXT | `preset`, `guide`, `texture`, `other` |
| `description` | TEXT | Short description |
| `file_path` | TEXT NOT NULL | Path under `public/outputs/` |
| `version` | TEXT DEFAULT '1.0' | Version string |
| `price_usd` | REAL NOT NULL | Price in USD (0 = free lead magnet) |
| `active` | INTEGER DEFAULT 1 | 1 = listed |
| `created_at` | TEXT | ISO 8601 timestamp |

---

## `orders`

Tracks a customer purchase event.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `product_type` | TEXT | `print` or `digital` |
| `product_id` | INTEGER | FK to `photos.id` or `digital_products.id` |
| `customer_email` | TEXT | Buyer contact |
| `status` | TEXT | `pending`, `fulfilled`, `failed` |
| `fulfillment_provider` | TEXT | `printful`, `printify`, `direct` |
| `fulfillment_ref` | TEXT | External order ID from provider |
| `stripe_payment_id` | TEXT | Stripe payment intent ID |
| `created_at` | TEXT | ISO 8601 timestamp |

---

## `storage_locations`

Tracks physical file storage for all assets.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `entity_type` | TEXT | `photo`, `digital_product` |
| `entity_id` | INTEGER | FK to parent entity |
| `local_path` | TEXT NOT NULL | Absolute local file path |
| `cloud_uri` | TEXT | Optional fallback CDN/cloud URI |
| `created_at` | TEXT | ISO 8601 timestamp |
