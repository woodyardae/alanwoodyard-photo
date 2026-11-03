# alanwoodyard.photo

Fine-Art Photography Storefront, Automated Pre-Flight Asset Engine & Multi-Provider Print Fulfillment System.

## Architecture

- **SSG Framework:** Astro 5 + TypeScript + Tailwind CSS
- **Edge Deployment:** Cloudflare Pages
- **Catalog System:** Astro Content Collections with Zod Schema (`src/content/config.ts`)
- **Pre-Flight Asset Engine:** Sharp (`scripts/preflight-prints.ts`)
  - Calculates maximum print dimensions at 300 DPI (paper/canvas) and 180 DPI (metal)
  - Produces 300 DPI TIFFs with 0.125-inch mirrored bleed margins
  - Perceptual transform to sRGB with WebP storefront mockups
- **Multi-Provider Fulfillment Router:** Top 5 POD Labs (`src/lib/fulfillment.ts`)
  - `prodigi:*` -> Prodigi API v4.0 (Hahnemühle, fine-art rag, acrylic float mounts)
  - `printify:*` -> Printify API v1 (Framed posters, crossover merch)
  - `printful:*` -> Printful API v2 (Wall art, canvas)
  - `gelato:*` -> Gelato API v2 (International orders)
  - `gooten:*` -> Gooten API v1 (Acrylic blocks, home decor)
  - Split-cart multi-package shipping calculation logic
- **Telemetry:** Sovereign Umami analytics on `chantecler-01:3008`
- **Lead Capture:** Cloudflare Pages Function `functions/api/subscribe.ts` using Resend API to deliver 4K wallpaper welcome packages.

## Subdomain & DNS Configuration

- `alanwoodyard.photo` -> Cloudflare Pages (Apex & WWW)
- `faa.alanwoodyard.photo` -> CNAME to Pixels.com (Fine Art America / Pixels white-label gallery)
See [docs/dns.md](docs/dns.md) for full records.

## Scripts

```bash
npm run dev        # Launch local Astro dev server
npm run build      # Build static production artifacts for Cloudflare Pages
npm run preflight  # Run Sharp automated pre-flight asset engine
npm run typecheck  # Validate TypeScript types
```
