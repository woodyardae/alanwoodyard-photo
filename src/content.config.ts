import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const artworks = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/artworks' }),
  schema: z.object({
    id: z.string().optional(),
    title: z.string(),
    caption: z.string().optional().default(''),
    description: z.string().optional().default(''),
    mood: z.string().default('all'),
    collections: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    solo_display: z.boolean().default(true),
    master_file: z.string().optional(),
    sha256: z.string().optional(),
    version: z.number().default(1),
    display: z.object({
      watermark: z.string().default('default'),
    }).optional().default({}),
    capture: z.object({
      date: z.string().optional().default(''),
      location: z.union([z.string(), z.record(z.any())]).optional().default(''),
      camera: z.string().optional().default(''),
      lens: z.string().optional().default(''),
      settings: z.record(z.any()).optional().default({}),
      native_dimensions: z.object({
        width: z.number(),
        height: z.number(),
      }).optional(),
      aspect_ratio: z.string().optional(),
    }).optional().default({}),
    merch_approved: z.array(z.string()).optional().default([]),
    merch_crops: z.record(z.any()).optional().default({}),
    print_variants: z.array(
      z.object({
        sku: z.string(),
        substrate: z.string(),
        size: z.string(),
        price_cents: z.number(),
      })
    ).optional().default([]),
  }),
});

const garden = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/garden' }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    stage: z.enum(['sprout', 'budding', 'evergreen']).default('sprout'),
    location: z.string().optional().default(''),
    summary: z.string().optional().default(''),
    tags: z.array(z.string()).default([]),
    linked_artworks: z.array(z.string()).default([]),
  }),
});

export const collections = { artworks, garden };