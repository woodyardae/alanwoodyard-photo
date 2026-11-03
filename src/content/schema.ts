import { z } from 'zod';

export const collectionsEnum = [
  'maritime',
  'coastal-geometry',
  'austin-skyline',
  'chesapeake-heritage',
  'gulf-coast',
  'minimalist',
  'black-and-white',
  'limited-edition'
] as const;

export const colorSpaceEnum = ['ProPhoto RGB', 'Adobe RGB 1998', 'sRGB'] as const;
export const whitePointEnum = ['D50', 'D65'] as const;
export const aspectRatioEnum = ['1:1', '4:5', '2:3', '16:9', 'panoramic'] as const;
export const orientationEnum = ['landscape', 'portrait', 'square', 'panoramic'] as const;
export const substrateEnum = [
  'hahnemuhle-rag',
  'aluminum-panel',
  'acrylic-float',
  'framed-print',
  'stretched-canvas',
  'linen-art-cards',
  'desk-mat'
] as const;
export const podLabEnum = ['prodigi', 'printify', 'printful', 'gelato', 'gooten'] as const;

export const variantSchema = z.object({
  sku: z.string(),
  substrate: z.enum(substrateEnum),
  substrateName: z.string(),
  size: z.string(),
  widthInches: z.number().positive(),
  heightInches: z.number().positive(),
  lab: z.enum(podLabEnum),
  supplierSku: z.string(),
  baseCostUsd: z.number().positive(),
  retailPriceUsd: z.number().positive(),
  inStock: z.boolean().default(true)
});

export const artworkSchema = z.object({
  id: z
    .string()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      'Master ID must be a valid UUIDv7'
    ),
  title: z.string(),
  slug: z.string(),
  description: z.string(),
  capture: z.object({
    date: z.string(),
    location: z.object({
      name: z.string(),
      region: z.string().optional(),
      coordinates: z
        .object({
          lat: z.number(),
          lon: z.number()
        })
        .optional()
    }),
    camera: z.string(),
    lens: z.string(),
    focalLength: z.string(),
    aperture: z.string(),
    shutterSpeed: z.string(),
    iso: z.number().int().positive()
  }),
  colorScience: z.object({
    colorSpace: z.enum(colorSpaceEnum),
    dominantHex: z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)),
    whitePoint: z.enum(whitePointEnum)
  }),
  dimensions: z.object({
    widthPx: z.number().int().positive(),
    heightPx: z.number().int().positive(),
    aspectRatio: z.enum(aspectRatioEnum),
    orientation: z.enum(orientationEnum)
  }),
  collections: z.array(z.enum(collectionsEnum)).min(1),
  limitedEdition: z
    .object({
      isLimited: z.boolean(),
      editionSize: z.number().int().positive().optional(),
      certificateOfAuthenticity: z.boolean().default(true)
    })
    .optional(),
  masterAsset: z
    .object({
      sourcePath: z.string(),
      tiffMasterPath: z.string().optional(),
      maxDpiPaperWidthInches: z.number().optional(),
      maxDpiPaperHeightInches: z.number().optional(),
      maxDpiMetalWidthInches: z.number().optional(),
      maxDpiMetalHeightInches: z.number().optional()
    })
    .optional(),
  previewImage: z.string(),
  framedMockup: z.string().optional(),
  variants: z.array(variantSchema).min(1)
});

export type Artwork = z.infer<typeof artworkSchema>;
export type Variant = z.infer<typeof variantSchema>;
export type CollectionTag = (typeof collectionsEnum)[number];
