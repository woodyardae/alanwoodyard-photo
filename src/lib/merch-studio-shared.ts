/**
 * Canonical Merch Studio aspect-ratio buckets, DPI requirements, and store product rubrics.
 * Synced to the SeeWhatSticks checkout at packages/pod-merch-studio/index.ts via scripts/sync-shared-studio.ts.
 */

export type RatioKey =
  | '1:1'
  | '2:3'
  | '4:5'
  | '3:4'
  | '16:9'
  | '16:7'
  | '17:7'
  | '1:2'
  | '5:7'
  | '20:29';

export interface ProductRubricItem {
  id: string;
  name: string;
  vendor: 'Prodigi' | 'Printify' | 'Printful' | 'Gelato' | 'Displate';
  retail: string;
  minDpi: number;
  minPx: string;
}

export interface CropPayload {
  panX: number;
  panY: number;
  zoom: number;
  ratio?: number;
  approved_products?: string[];
  excluded_products?: string[];
  approved_at?: string;
}

/** Retail floors and bands enforced across AWP + SWS rubrics. */
export const PRICE_FLOORS = {
  mug11ozMin: 22,
  mug11ozMax: 26,
  stickerPack4to6Min: 12,
  stickerPack4to6Max: 16,
  printifyCoaster4pkMin: 28,
  printifyCoaster4pkMax: 32,
  comfortColors1717Min: 34,
  comfortColors1717Max: 40,
  hoodieMin: 49.99,
} as const;

/**
 * Desk-mat framing: 16:7 and 2:1 horizons must stay above the keyboard zone
 * (lower ~40% of the canvas). panY is clamped so the horizon band cannot drift down.
 */
export const DESK_MAT_FRAMING = {
  ratios: ['16:7', '2:1'] as const,
  /** Fraction of canvas height reserved for keyboard / wrist rest. */
  keyboardZoneFraction: 0.4,
  /** Horizon must remain in the upper (1 - keyboardZoneFraction) of the frame. */
  maxDownwardPanFraction: 0.15,
} as const;

/** Hard IP exclusions for merch generation and approval. */
export const IP_EXCLUSIONS = {
  zero1984UsMerch: true,
  bannedMarks: [
    'ARRL',
    'NOAA',
    'NWS',
    'J24',
    'OEM',
    'D.A.R.E.',
    'DARE',
  ] as const,
  banDareTradeDressParody: true,
} as const;

export const RATIO_KEYS: RatioKey[] = [
  '1:1',
  '2:3',
  '4:5',
  '3:4',
  '16:9',
  '16:7',
  '17:7',
  '1:2',
  '5:7',
  '20:29',
];

export const RATIO_MAP: Record<RatioKey, number> = {
  '1:1': 1.0,
  '2:3': 2 / 3,
  '4:5': 4 / 5,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
  '16:7': 16 / 7,
  '17:7': 17 / 7,
  '1:2': 0.5,
  '5:7': 5 / 7,
  '20:29': 20 / 29,
};

export const RATIO_LABELS: Record<RatioKey, string> = {
  '1:1': '1:1 Square Goods, Stickers, Blocks & Pillows',
  '2:3': '2:3 Classic Fine Art, Acrylic & Metal',
  '4:5': '4:5 Apparel Chest, Matted Frame & Hoodies',
  '3:4': '3:4 Medium Posters, Frames & Jigsaw Puzzles',
  '16:9': '16:9 Cinematic Metal & Canvases',
  '16:7': '16:7 Panoramic Desk Pads & Blocks',
  '17:7': '17:7 Waterfront Mugs & Tumblers',
  '1:2': '1:2 Tough Phone Cases & Drinkware',
  '5:7': '5:7 Archival Stationery & Postcards',
  '20:29': '20:29 Displate Steel Poster',
};

export const PHOTO_RATIO_PRODUCTS: Record<RatioKey, ProductRubricItem[]> = {
  '1:1': [
    { id: 'prodigi-acrylic-block-4x4', name: 'Optical Acrylic Block (4x4")', vendor: 'Prodigi', retail: '$38.00', minDpi: 300, minPx: '1200x1200' },
    { id: 'prodigi-acrylic-block-6x6', name: 'Optical Acrylic Block (6x6")', vendor: 'Prodigi', retail: '$52.00', minDpi: 300, minPx: '1800x1800' },
    { id: 'prodigi-acrylic-block-8x8', name: 'Optical Acrylic Block (8x8")', vendor: 'Prodigi', retail: '$68.00', minDpi: 300, minPx: '2400x2400' },
    { id: 'prodigi-rag-12x12', name: 'Square Photo Rag Print (12x12")', vendor: 'Prodigi', retail: '$85.00', minDpi: 300, minPx: '3600x3600' },
    { id: 'prodigi-rag-20x20', name: 'Square Photo Rag Print (20x20")', vendor: 'Prodigi', retail: '$175.00', minDpi: 300, minPx: '6000x6000' },
    { id: 'prodigi-canvas-12x12', name: 'Stretched Museum Canvas (12x12")', vendor: 'Prodigi', retail: '$135.00', minDpi: 240, minPx: '2880x2880' },
    { id: 'prodigi-canvas-20x20', name: 'Stretched Museum Canvas (20x20")', vendor: 'Prodigi', retail: '$210.00', minDpi: 240, minPx: '4800x4800' },
    { id: 'printify-coasters-4pk', name: 'Hardwood Coaster Set (4-Pk)', vendor: 'Printify', retail: '$32.00', minDpi: 300, minPx: '1200x1200' },
    { id: 'printify-cork-coasters-4pk', name: 'Cork Coaster Set (4-Pk)', vendor: 'Printify', retail: '$28.00', minDpi: 300, minPx: '1200x1200' },
    { id: 'printify-pillow-18', name: 'Spun Poly Throw Pillow (18x18")', vendor: 'Printify', retail: '$42.00', minDpi: 180, minPx: '3240x3240' },
    { id: 'printify-pillow-22', name: 'Spun Poly Throw Pillow (22x22")', vendor: 'Printify', retail: '$52.00', minDpi: 180, minPx: '3960x3960' },
    { id: 'printful-tote-bag', name: 'Heavyweight Canvas Tote Bag', vendor: 'Printful', retail: '$38.00', minDpi: 200, minPx: '3000x3000' },
  ],
  '2:3': [
    { id: 'prodigi-rag-12x18', name: 'Hahnemühle Photo Rag (12x18")', vendor: 'Prodigi', retail: '$125.00', minDpi: 300, minPx: '3600x5400' },
    { id: 'prodigi-rag-16x24', name: 'Hahnemühle Photo Rag (16x24")', vendor: 'Prodigi', retail: '$195.00', minDpi: 300, minPx: '4800x7200' },
    { id: 'prodigi-rag-20x30', name: 'Hahnemühle Photo Rag (20x30")', vendor: 'Prodigi', retail: '$265.00', minDpi: 300, minPx: '6000x9000' },
    { id: 'prodigi-rag-24x36', name: 'Hahnemühle Photo Rag (24x36")', vendor: 'Prodigi', retail: '$340.00', minDpi: 300, minPx: '7200x10800' },
    { id: 'prodigi-rag-30x40', name: 'Hahnemühle Photo Rag (30x40")', vendor: 'Prodigi', retail: '$480.00', minDpi: 300, minPx: '9000x12000' },
    { id: 'prodigi-frame-16x24', name: 'Matted Shadowbox Frame (16x24")', vendor: 'Prodigi', retail: '$385.00', minDpi: 300, minPx: '4800x7200' },
    { id: 'prodigi-frame-20x30', name: 'Matted Shadowbox Frame (20x30")', vendor: 'Prodigi', retail: '$495.00', minDpi: 300, minPx: '6000x9000' },
    { id: 'prodigi-frame-24x36', name: 'Matted Shadowbox Frame (24x36")', vendor: 'Prodigi', retail: '$650.00', minDpi: 300, minPx: '7200x10800' },
    { id: 'prodigi-acr-12x18', name: 'Optical Acrylic Float Panel (12x18")', vendor: 'Prodigi', retail: '$285.00', minDpi: 240, minPx: '2880x4320' },
    { id: 'prodigi-acr-16x24', name: 'Optical Acrylic Float Panel (16x24")', vendor: 'Prodigi', retail: '$420.00', minDpi: 240, minPx: '3840x5760' },
    { id: 'prodigi-acr-20x30', name: 'Optical Acrylic Float Panel (20x30")', vendor: 'Prodigi', retail: '$580.00', minDpi: 240, minPx: '4800x7200' },
    { id: 'prodigi-acr-24x36', name: 'Optical Acrylic Float Panel (24x36")', vendor: 'Prodigi', retail: '$750.00', minDpi: 240, minPx: '5760x8640' },
    { id: 'prodigi-met-12x18', name: 'Brushed Aluminum Metal Plate (12x18")', vendor: 'Prodigi', retail: '$220.00', minDpi: 200, minPx: '2400x3600' },
    { id: 'prodigi-met-16x24', name: 'Brushed Aluminum Metal Plate (16x24")', vendor: 'Prodigi', retail: '$340.00', minDpi: 200, minPx: '3200x4800' },
    { id: 'prodigi-met-20x30', name: 'Brushed Aluminum Metal Plate (20x30")', vendor: 'Prodigi', retail: '$460.00', minDpi: 200, minPx: '4000x6000' },
    { id: 'prodigi-met-24x36', name: 'Brushed Aluminum Metal Plate (24x36")', vendor: 'Prodigi', retail: '$580.00', minDpi: 200, minPx: '4800x7200' },
    { id: 'prodigi-can-16x24', name: 'Museum Stretched Canvas (16x24")', vendor: 'Prodigi', retail: '$195.00', minDpi: 200, minPx: '3200x4800' },
    { id: 'prodigi-can-20x30', name: 'Museum Stretched Canvas (20x30")', vendor: 'Prodigi', retail: '$260.00', minDpi: 200, minPx: '4000x6000' },
    { id: 'prodigi-can-24x36', name: 'Museum Stretched Canvas (24x36")', vendor: 'Prodigi', retail: '$340.00', minDpi: 200, minPx: '4800x7200' },
    { id: 'printful-can-24x36', name: 'Floater Framed Canvas (24x36")', vendor: 'Printful', retail: '$365.00', minDpi: 200, minPx: '4800x7200' },
  ],
  '4:5': [
    { id: 'prodigi-frame-8x10', name: 'Matted Gallery Frame (8x10")', vendor: 'Prodigi', retail: '$145.00', minDpi: 300, minPx: '2400x3000' },
    { id: 'prodigi-frame-16x20', name: 'Matted Gallery Frame (16x20")', vendor: 'Prodigi', retail: '$220.00', minDpi: 300, minPx: '4800x6000' },
    { id: 'prodigi-rag-8x10', name: 'Hahnemühle Photo Rag (8x10")', vendor: 'Prodigi', retail: '$75.00', minDpi: 300, minPx: '2400x3000' },
    { id: 'prodigi-rag-16x20', name: 'Hahnemühle Photo Rag (16x20")', vendor: 'Prodigi', retail: '$165.00', minDpi: 300, minPx: '4800x6000' },
    { id: 'prodigi-can-16x20', name: 'Museum Stretched Canvas (16x20")', vendor: 'Prodigi', retail: '$165.00', minDpi: 200, minPx: '3200x4000' },
    { id: 'printful-can-24x30', name: 'Museum Stretched Canvas (24x30")', vendor: 'Printful', retail: '$235.00', minDpi: 200, minPx: '4800x6000' },
    { id: 'printful-tee-chest', name: 'Heavyweight Studio Tee (Chest Print)', vendor: 'Printful', retail: '$48.00', minDpi: 240, minPx: '2400x3000' },
  ],
  '3:4': [
    { id: 'prodigi-frame-18x24', name: 'Matted Gallery Frame (18x24")', vendor: 'Prodigi', retail: '$295.00', minDpi: 300, minPx: '5400x7200' },
    { id: 'prodigi-rag-18x24', name: 'Hahnemühle Photo Rag (18x24")', vendor: 'Prodigi', retail: '$185.00', minDpi: 300, minPx: '5400x7200' },
    { id: 'printify-puzzle-120', name: 'Die-Cut Jigsaw Puzzle (120-pc)', vendor: 'Printify', retail: '$28.00', minDpi: 300, minPx: '2400x3200' },
    { id: 'printify-puzzle-252', name: 'Die-Cut Jigsaw Puzzle (252-pc)', vendor: 'Printify', retail: '$34.00', minDpi: 300, minPx: '3150x4200' },
    { id: 'printify-puzzle-500', name: 'Die-Cut Jigsaw Puzzle (500-pc)', vendor: 'Printify', retail: '$42.00', minDpi: 300, minPx: '4800x6400' },
    { id: 'printify-puzzle-1000', name: 'Die-Cut Jigsaw Puzzle (1000-pc)', vendor: 'Printify', retail: '$54.00', minDpi: 300, minPx: '6000x8000' },
    { id: 'gelato-wall-calendar', name: 'Wire-O Wall Calendar (11x8.5")', vendor: 'Gelato', retail: '$38.00', minDpi: 300, minPx: '3300x2550' },
  ],
  '16:9': [
    { id: 'prodigi-met-18x32', name: 'Aluminum Horizon Panel (18x32")', vendor: 'Prodigi', retail: '$440.00', minDpi: 200, minPx: '3600x6400' },
    { id: 'prodigi-can-18x32', name: 'Panoramic Stretched Canvas (18x32")', vendor: 'Prodigi', retail: '$240.00', minDpi: 200, minPx: '3600x6400' },
    { id: 'prodigi-acr-18x32', name: 'Optical Acrylic Horizon Panel (18x32")', vendor: 'Prodigi', retail: '$520.00', minDpi: 240, minPx: '4320x7680' },
    { id: 'prodigi-panoramic-block', name: 'Panoramic Acrylic Desk Block (8x4.5")', vendor: 'Prodigi', retail: '$56.00', minDpi: 300, minPx: '2400x1350' },
  ],
  '16:7': [
    { id: 'prodigi-blk-8x4', name: 'Panoramic Acrylic Desk Block (8x4")', vendor: 'Prodigi', retail: '$56.00', minDpi: 300, minPx: '2400x1200' },
    { id: 'printify-deskmat-std', name: 'Studio Panoramic Desk Mat (31.5x15.5")', vendor: 'Printify', retail: '$48.00', minDpi: 300, minPx: '9450x4650' },
    { id: 'printify-deskmat-xl', name: 'Extra-Large Studio Desk Pad (35.4x15.7")', vendor: 'Printify', retail: '$54.00', minDpi: 300, minPx: '10620x4710' },
    { id: 'printify-deskmat-xxl', name: 'Command Deck Desk Mat (39.4x17.7")', vendor: 'Printify', retail: '$64.00', minDpi: 300, minPx: '11820x5310' },
  ],
  '17:7': [
    { id: 'prodigi-mug-11oz', name: 'Ceramic Waterfront Mug (11oz)', vendor: 'Prodigi', retail: '$22.00', minDpi: 300, minPx: '2600x1070' },
    { id: 'prodigi-mug-15oz', name: 'Ceramic Waterfront Mug (15oz)', vendor: 'Prodigi', retail: '$26.00', minDpi: 300, minPx: '2900x1200' },
    { id: 'printify-enamel-mug', name: 'Stainless Enamel Camp Mug (12oz)', vendor: 'Printify', retail: '$28.00', minDpi: 300, minPx: '2550x1050' },
    { id: 'printify-tumbler-20oz', name: 'Stainless Travel Tumbler (20oz)', vendor: 'Printify', retail: '$34.00', minDpi: 300, minPx: '2700x1100' },
    { id: 'printify-waterbottle-32oz', name: 'Insulated Sports Bottle (32oz)', vendor: 'Printify', retail: '$38.00', minDpi: 300, minPx: '3100x1250' },
  ],
  '1:2': [
    { id: 'printify-phone-iphone-pro', name: 'Tough Case (iPhone 14/15/16 Pro)', vendor: 'Printify', retail: '$36.00', minDpi: 300, minPx: '1500x3000' },
    { id: 'printify-phone-iphone-max', name: 'Tough Case (iPhone 14/15/16 Pro Max)', vendor: 'Printify', retail: '$36.00', minDpi: 300, minPx: '1600x3200' },
    { id: 'printify-phone-galaxy-ultra', name: 'Tough Case (Galaxy S23/S24/S25 Ultra)', vendor: 'Printify', retail: '$36.00', minDpi: 300, minPx: '1600x3200' },
  ],
  '5:7': [
    { id: 'prodigi-post-10pk', name: 'Archival Postcards (5x7" 10-Pk)', vendor: 'Prodigi', retail: '$34.00', minDpi: 300, minPx: '1500x2100' },
    { id: 'prodigi-cards-10pk', name: 'Fine-Art Folded Greeting Cards (5x7" 10-Pk)', vendor: 'Prodigi', retail: '$42.00', minDpi: 300, minPx: '1500x2100' },
    { id: 'prodigi-folio-5x7', name: 'Collector Mini-Print Folio (5x7")', vendor: 'Prodigi', retail: '$65.00', minDpi: 300, minPx: '1500x2100' },
    { id: 'prodigi-frame-11x14', name: 'Matted Gallery Frame (11x14")', vendor: 'Prodigi', retail: '$185.00', minDpi: 300, minPx: '3300x4200' },
  ],
  '20:29': [
    { id: 'displate-steel-m', name: 'Displate Steel Poster - Medium (17.7x12.6")', vendor: 'Displate', retail: '$49.00', minDpi: 300, minPx: '3780x5310' },
    { id: 'displate-steel-l', name: 'Displate Steel Poster - Large (26.6x18.9")', vendor: 'Displate', retail: '$98.00', minDpi: 300, minPx: '5670x7980' },
  ],
};

export const SWS_RATIO_PRODUCTS: Record<RatioKey, ProductRubricItem[]> = {
  '4:5': [
    { id: 'printify-cc1717-tee', name: 'Comfort Colors 1717 Vintage Wash Tee', vendor: 'Printify', retail: '$34.00', minDpi: 240, minPx: '2400x3000' },
    { id: 'printful-bc3001-tee', name: 'Bella+Canvas 3001 Heavyweight Tee', vendor: 'Printful', retail: '$32.00', minDpi: 240, minPx: '2400x3000' },
    { id: 'printify-hoodie-18500', name: 'Gildan 18500 Heavy Blend Hoodie', vendor: 'Printify', retail: '$54.00', minDpi: 240, minPx: '2400x3000' },
    { id: 'printify-cc1566-crew', name: 'Comfort Colors 1566 Crewneck Sweatshirt', vendor: 'Printify', retail: '$48.00', minDpi: 240, minPx: '2400x3000' },
  ],
  '1:1': [
    { id: 'printify-sticker-4x4', name: 'Die-Cut Kiss-Cut Vinyl Sticker Pack (4-6)', vendor: 'Printify', retail: '$14.00', minDpi: 300, minPx: '1200x1200' },
    { id: 'printify-holo-sticker', name: 'Holographic Laptop Sticker Pack (4-6)', vendor: 'Printify', retail: '$16.00', minDpi: 300, minPx: '1200x1200' },
    { id: 'printify-ornament-round', name: 'Ceramic Holiday Ornament', vendor: 'Printify', retail: '$22.00', minDpi: 300, minPx: '1200x1200' },
    { id: 'printify-coasters-4pk', name: 'Hardwood Coaster Set (4-Pk)', vendor: 'Printify', retail: '$30.00', minDpi: 300, minPx: '1200x1200' },
    { id: 'printify-cork-coasters-4pk', name: 'Cork Coaster Set (4-Pk)', vendor: 'Printify', retail: '$28.00', minDpi: 300, minPx: '1200x1200' },
    { id: 'printful-tote-bag', name: 'Heavyweight Canvas Tote Bag', vendor: 'Printful', retail: '$32.00', minDpi: 200, minPx: '3000x3000' },
  ],
  '17:7': [
    { id: 'printify-mug-11oz', name: '11oz Vitrified Diner / Specimen Mug', vendor: 'Printify', retail: '$22.00', minDpi: 300, minPx: '2600x1070' },
    { id: 'printify-mug-15oz', name: '15oz Camp / Radio Field Mug', vendor: 'Printify', retail: '$26.00', minDpi: 300, minPx: '2900x1200' },
    { id: 'printify-enamel-mug', name: '12oz Enamel Campfire Mug', vendor: 'Printify', retail: '$26.00', minDpi: 300, minPx: '2550x1050' },
    { id: 'printify-tumbler-20oz', name: '20oz Insulated Travel Tumbler', vendor: 'Printify', retail: '$32.00', minDpi: 300, minPx: '2700x1100' },
  ],
  '3:4': [
    { id: 'printful-poster-18x24', name: 'Museum-Grade Matte Poster 18x24"', vendor: 'Printful', retail: '$28.00', minDpi: 300, minPx: '5400x7200' },
    { id: 'printify-puzzle-500', name: 'Jigsaw Puzzle 500-pc', vendor: 'Printify', retail: '$38.00', minDpi: 300, minPx: '4800x6400' },
  ],
  '2:3': [
    { id: 'prodigi-rag-12x18', name: 'Archival Fine-Art Poster 12x18"', vendor: 'Prodigi', retail: '$125.00', minDpi: 300, minPx: '3600x5400' },
    { id: 'printful-poster-24x36', name: 'Statement Poster 24x36"', vendor: 'Printful', retail: '$38.00', minDpi: 240, minPx: '5760x8640' },
  ],
  '16:9': [
    { id: 'printify-canvas-18x32', name: 'Panoramic Framed Canvas (18x32")', vendor: 'Printify', retail: '$95.00', minDpi: 200, minPx: '3600x6400' },
    { id: 'prodigi-panoramic-block', name: 'Panoramic Acrylic Desk Block (8x4.5")', vendor: 'Prodigi', retail: '$56.00', minDpi: 300, minPx: '2400x1350' },
  ],
  '16:7': [
    { id: 'printify-deskmat-std', name: 'Desk Mat (31.5x15.5")', vendor: 'Printify', retail: '$36.00', minDpi: 300, minPx: '9450x4650' },
    { id: 'printify-deskmat-xl', name: 'XL Workbench Desk Pad (35.4x15.7")', vendor: 'Printify', retail: '$44.00', minDpi: 300, minPx: '10620x4710' },
    { id: 'prodigi-blk-8x4', name: 'Panoramic Acrylic Desk Block (8x4")', vendor: 'Prodigi', retail: '$56.00', minDpi: 300, minPx: '2400x1200' },
  ],
  '1:2': [
    { id: 'printify-phone-iphone-pro', name: 'Tough Case (iPhone Pro Series)', vendor: 'Printify', retail: '$32.00', minDpi: 300, minPx: '1500x3000' },
    { id: 'printify-phone-galaxy-ultra', name: 'Tough Case (Galaxy Ultra Series)', vendor: 'Printify', retail: '$32.00', minDpi: 300, minPx: '1600x3200' },
  ],
  '5:7': [
    { id: 'prodigi-post-10pk', name: 'Retro Postcard Pack (5x7" 10-Pk)', vendor: 'Prodigi', retail: '$24.00', minDpi: 300, minPx: '1500x2100' },
    { id: 'prodigi-cards-10pk', name: 'Holiday Greeting Cards (5x7" 10-Pk)', vendor: 'Prodigi', retail: '$28.00', minDpi: 300, minPx: '1500x2100' },
  ],
  '20:29': [
    { id: 'displate-steel-m', name: 'Displate Steel Poster - Medium (17.7x12.6")', vendor: 'Displate', retail: '$49.00', minDpi: 300, minPx: '3780x5310' },
    { id: 'displate-steel-l', name: 'Displate Steel Poster - Large (26.6x18.9")', vendor: 'Displate', retail: '$98.00', minDpi: 300, minPx: '5670x7980' },
  ],
};

export function parseRetailDollars(retail: string): number | null {
  const match = /\$?\s*([0-9]+(?:\.[0-9]+)?)/.exec(retail);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function isDeskMatFramingRatio(ratioKey: string): boolean {
  return (DESK_MAT_FRAMING.ratios as readonly string[]).includes(ratioKey);
}

/**
 * Clamp panY so horizon framing for desk mats stays above the keyboard zone.
 * Positive panY moves the image down (horizon drifts into the wrist-rest band).
 */
export function clampDeskMatPanY(panY: number, canvasHeight: number): number {
  if (!(canvasHeight > 0) || !Number.isFinite(panY)) return 0;
  const maxDown = canvasHeight * DESK_MAT_FRAMING.maxDownwardPanFraction;
  const maxUp = canvasHeight * DESK_MAT_FRAMING.keyboardZoneFraction;
  return Math.max(-maxUp, Math.min(maxDown, panY));
}

export function textHitsIpExclusion(text: string): boolean {
  const hay = (text || '').toUpperCase();
  if (!hay) return false;
  if (IP_EXCLUSIONS.zero1984UsMerch && /\b1984\b/.test(hay)) return true;
  for (const mark of IP_EXCLUSIONS.bannedMarks) {
    const needle = mark.toUpperCase().replace(/\./g, '\\.');
    if (new RegExp(`\\b${needle}\\b`, 'i').test(hay)) return true;
  }
  if (IP_EXCLUSIONS.banDareTradeDressParody && /\bD\.?\s*A\.?\s*R\.?\s*E\.?\b/i.test(text || '')) {
    return true;
  }
  return false;
}

export function assertRubricPriceFloors(
  products: Iterable<ProductRubricItem>,
): string[] {
  const violations: string[] = [];
  for (const item of products) {
    const dollars = parseRetailDollars(item.retail);
    if (dollars == null) {
      violations.push(`${item.id}: unparseable retail ${item.retail}`);
      continue;
    }
    const id = item.id.toLowerCase();
    const name = item.name.toLowerCase();
    if (id.includes('mug-11oz') || (name.includes('11oz') && name.includes('mug'))) {
      if (dollars < PRICE_FLOORS.mug11ozMin || dollars > PRICE_FLOORS.mug11ozMax) {
        violations.push(`${item.id}: 11oz mug must be $${PRICE_FLOORS.mug11ozMin}-$${PRICE_FLOORS.mug11ozMax}, got ${item.retail}`);
      }
    }
    if (id.includes('sticker') && (name.includes('4-6') || name.includes('pack'))) {
      if (dollars < PRICE_FLOORS.stickerPack4to6Min || dollars > PRICE_FLOORS.stickerPack4to6Max) {
        violations.push(`${item.id}: sticker pack must be $${PRICE_FLOORS.stickerPack4to6Min}-$${PRICE_FLOORS.stickerPack4to6Max}, got ${item.retail}`);
      }
    }
    if (
      item.vendor === 'Printify' &&
      id.includes('coaster') &&
      (id.includes('4pk') || name.includes('4-pk') || name.includes('4-pack'))
    ) {
      if (dollars < PRICE_FLOORS.printifyCoaster4pkMin || dollars > PRICE_FLOORS.printifyCoaster4pkMax) {
        violations.push(`${item.id}: Printify 4-pack coasters must be $${PRICE_FLOORS.printifyCoaster4pkMin}-$${PRICE_FLOORS.printifyCoaster4pkMax}, got ${item.retail}`);
      }
    }
    if (id.includes('cc1717') || name.includes('comfort colors 1717')) {
      if (dollars < PRICE_FLOORS.comfortColors1717Min || dollars > PRICE_FLOORS.comfortColors1717Max) {
        violations.push(`${item.id}: CC1717 tee must be $${PRICE_FLOORS.comfortColors1717Min}-$${PRICE_FLOORS.comfortColors1717Max}, got ${item.retail}`);
      }
    }
    if (id.includes('hoodie') || name.includes('hoodie')) {
      if (dollars < PRICE_FLOORS.hoodieMin) {
        violations.push(`${item.id}: hoodie must be $${PRICE_FLOORS.hoodieMin}+, got ${item.retail}`);
      }
    }
  }
  return violations;
}

export function resolveRatio(key: string, cropInfo?: { ratio?: number }): number {
  if (cropInfo && typeof cropInfo.ratio === 'number' && cropInfo.ratio > 0) {
    return cropInfo.ratio;
  }
  if (key in RATIO_MAP) {
    return RATIO_MAP[key as RatioKey];
  }
  const parts = key.split(':').map(Number);
  if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
    return parts[0] / parts[1];
  }
  return 1.5;
}

export type CropDecision = 'accepted' | 'rejected' | 'pending';
export type ArtworkQueueStatus = 'needs_review' | 'approved' | 'rejected';

export interface ArtworkReviewState {
  rejected?: boolean;
  crops?: Record<string, unknown> | null;
}

export interface RejectedCropRecord {
  rejected: true;
  rejected_at: string;
}

export function isKnownRatioKey(value: unknown): value is RatioKey {
  return typeof value === 'string' && (RATIO_KEYS as readonly string[]).includes(value);
}

/** Explicit No for one ratio. The ratio stays unusable for this image. */
export function isRejectedCropValue(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return (value as { rejected?: unknown }).rejected === true;
}

/** Explicit Yes: a saved crop version for this ratio. */
export function isAcceptedCropValue(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (isRejectedCropValue(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.panX === 'number' || typeof record.panY === 'number' || typeof record.zoom === 'number') {
    return true;
  }
  if (typeof record.approved_at === 'string' && record.approved_at.length > 0) return true;
  if (Array.isArray(record.approved_products)) return true;
  if (record.crop && typeof record.crop === 'object') return true;
  return false;
}

export function rejectedCropRecord(rejectedAt: string): RejectedCropRecord {
  return { rejected: true, rejected_at: rejectedAt };
}

export function cropDecisionForRatio(
  crops: Record<string, unknown> | null | undefined,
  ratioKey: string,
): CropDecision {
  if (!isKnownRatioKey(ratioKey)) return 'pending';
  const entry = crops ? crops[ratioKey] : undefined;
  if (isRejectedCropValue(entry)) return 'rejected';
  if (isAcceptedCropValue(entry)) return 'accepted';
  return 'pending';
}

/**
 * SKU rejection stays whole-item.
 * Otherwise the crop set stays in review until every candidate ratio is
 * an accepted saved crop or an explicit rejection.
 */
export function artworkQueueStatus(item: ArtworkReviewState | null | undefined): ArtworkQueueStatus {
  if (!item) return 'needs_review';
  const crops =
    item.crops && typeof item.crops === 'object' && !Array.isArray(item.crops) ? item.crops : {};
  if (item.rejected === true || crops.__rejected === true) return 'rejected';
  for (const key of RATIO_KEYS) {
    if (cropDecisionForRatio(crops, key) === 'pending') return 'needs_review';
  }
  return 'approved';
}
