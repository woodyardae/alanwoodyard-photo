import fs from 'node:fs';
import path from 'node:path';
import { v7 as uuidv7 } from 'uuid';

const ARTWORKS_DIR = path.resolve('src/content/artworks');
if (!fs.existsSync(ARTWORKS_DIR)) {
  fs.mkdirSync(ARTWORKS_DIR, { recursive: true });
}

interface PreflightItem {
  slug: string;
  nativeWidth: number;
  nativeHeight: number;
  nativeSpace: string;
  maxPaperWidthInches: number;
  maxPaperHeightInches: number;
  maxMetalWidthInches: number;
  maxMetalHeightInches: number;
  tiffMasterPath: string;
  previewWebpPath: string;
  mockupWebpPath: string;
  dominantHexColors: string[];
}

const manifest: PreflightItem[] = JSON.parse(
  fs.readFileSync('assets/preflight-manifest.json', 'utf-8')
);

const artworksMeta = [
  {
    slug: 'austin-skyline-rowing-dawn',
    title: 'Dawn Shell on Lady Bird Lake',
    description:
      'A solitary single scull cuts through glass-still water beneath the First Street and Congress Avenue bridges as dawn twilight illuminates the Austin downtown skyline. Captured with high dynamic range in native ProPhoto RGB to preserve delicate specular morning light and amber skyscraper reflections.',
    capture: {
      date: '2026-03-22',
      location: {
        name: 'Lady Bird Lake, Austin',
        region: 'Texas, USA',
        coordinates: { lat: 30.2625, lon: -97.7475 }
      },
      camera: 'Fujifilm GFX 100 II Medium Format',
      lens: 'Fujinon GF 45-100mm f/4 R LM OIS WR',
      focalLength: '68mm',
      aperture: 'f/8.0',
      shutterSpeed: '1/60s',
      iso: 100
    },
    colorScience: {
      colorSpace: 'ProPhoto RGB',
      dominantHex: ['#182838', '#f97316', '#38bdf8'],
      whitePoint: 'D65'
    },
    aspectRatio: '2:3',
    orientation: 'landscape',
    collections: ['austin-skyline', 'minimalist', 'limited-edition'],
    limitedEdition: {
      isLimited: true,
      editionSize: 50,
      certificateOfAuthenticity: true
    }
  },
  {
    slug: 'chesapeake-skipjack-twilight',
    title: 'Chesapeake Skipjack at Low Mist',
    description:
      'A historic oyster-dredging wooden skipjack ghosting on light airs through morning ground fog off Tilghman Island. Rendered in wide-gamut Adobe RGB 1998 calibrated to D50 museum viewing conditions for faithful silver-toned sea mist and weathered cedar planking.',
    capture: {
      date: '2025-10-14',
      location: {
        name: 'Tilghman Island, Chesapeake Bay',
        region: 'Maryland, USA',
        coordinates: { lat: 38.7093, lon: -76.338 }
      },
      camera: 'Leica SL3 Full Frame',
      lens: 'Leica Vario-Elmarit-SL 24-90mm f/2.8-4 ASPH',
      focalLength: '50mm',
      aperture: 'f/5.6',
      shutterSpeed: '1/320s',
      iso: 64
    },
    colorScience: {
      colorSpace: 'Adobe RGB 1998',
      dominantHex: ['#282828', '#78716c', '#0284c7'],
      whitePoint: 'D50'
    },
    aspectRatio: '2:3',
    orientation: 'landscape',
    collections: ['chesapeake-heritage', 'maritime', 'limited-edition'],
    limitedEdition: {
      isLimited: true,
      editionSize: 25,
      certificateOfAuthenticity: true
    }
  },
  {
    slug: 'gulf-coast-pushboat-twilight',
    title: 'Houston Ship Channel Pushboat at Dusk',
    description:
      'A commercial twin-screw pushboat holding station against heavy chemical barges in the lower San Jacinto reach. Sodium vapor deck lights cast fiery orange reflections against deep obsidian river water, showcasing the raw industrial pulse of the Texas working waterfront.',
    capture: {
      date: '2025-11-28',
      location: {
        name: 'Houston Ship Channel / San Jacinto',
        region: 'Texas, USA',
        coordinates: { lat: 29.7495, lon: -95.0932 }
      },
      camera: 'Sony Alpha 1 Mirrorless',
      lens: 'Sony FE 70-200mm f/2.8 GM OSS II',
      focalLength: '135mm',
      aperture: 'f/4.0',
      shutterSpeed: '1/15s (stabilized)',
      iso: 800
    },
    colorScience: {
      colorSpace: 'ProPhoto RGB',
      dominantHex: ['#181818', '#ea580c', '#3b82f6'],
      whitePoint: 'D65'
    },
    aspectRatio: '16:9',
    orientation: 'landscape',
    collections: ['gulf-coast', 'coastal-geometry'],
    limitedEdition: {
      isLimited: false,
      certificateOfAuthenticity: false
    }
  },
  {
    slug: 'maritime-carbon-cutter-regatta',
    title: 'Offshore Cutter Under Full Spinnaker',
    description:
      'High-speed offshore ocean racing: an IRC 52-foot carbon cutter charging downwind in 24 knots of breeze with bow spray exploding over the pulpit. Saturated deep ocean cobalt and spinnaker nylon glow with pristine color purity.',
    capture: {
      date: '2026-02-17',
      location: {
        name: 'Galveston Offshore Racing Circuit',
        region: 'Gulf of Mexico, USA',
        coordinates: { lat: 29.281, lon: -94.755 }
      },
      camera: 'Sony A7R V Mirrorless',
      lens: 'Sony FE 24-70mm f/2.8 GM II',
      focalLength: '35mm',
      aperture: 'f/6.3',
      shutterSpeed: '1/2000s',
      iso: 250
    },
    colorScience: {
      colorSpace: 'ProPhoto RGB',
      dominantHex: ['#0888c8', '#082f49', '#f8fafc'],
      whitePoint: 'D65'
    },
    aspectRatio: '4:5',
    orientation: 'portrait',
    collections: ['maritime', 'limited-edition'],
    limitedEdition: {
      isLimited: true,
      editionSize: 75,
      certificateOfAuthenticity: true
    }
  },
  {
    slug: 'coastal-geometry-concrete-pier',
    title: 'Galveston Pleasure Pier Geometry',
    description:
      'Rhythmic reinforced concrete pilings marching into the Gulf surf. The low tidal angle casts long geometric shadows across wet sand, isolating the relentless mathematical cadence of marine civil engineering.',
    capture: {
      date: '2025-09-08',
      location: {
        name: '25th Street Seawall & Pier',
        region: 'Galveston Island, Texas',
        coordinates: { lat: 29.2856, lon: -94.7901 }
      },
      camera: 'Hasselblad 907X & CFV 100C',
      lens: 'XCD 45mm f/4 P',
      focalLength: '45mm (35mm equivalent)',
      aperture: 'f/11',
      shutterSpeed: '2.5s (ND filter)',
      iso: 64
    },
    colorScience: {
      colorSpace: 'Adobe RGB 1998',
      dominantHex: ['#282828', '#a1a1aa', '#f4f4f5'],
      whitePoint: 'D50'
    },
    aspectRatio: '1:1',
    orientation: 'square',
    collections: ['coastal-geometry', 'minimalist', 'black-and-white'],
    limitedEdition: {
      isLimited: false,
      certificateOfAuthenticity: false
    }
  },
  {
    slug: 'nautical-turnbuckle-rigging-bw',
    title: 'Foredeck Shroud & Bronze Turnbuckle',
    description:
      'High-contrast macro study of a 5/8-inch bronze and 316-marine-grade stainless turnbuckle holding standing rigging tension on an ocean cruising sloop. Silver gelatin tonal curve applied for deep obsidian shadows and micro-faceted chrome highlights.',
    capture: {
      date: '2026-01-19',
      location: {
        name: 'Annapolis Yacht Basin',
        region: 'Maryland, USA',
        coordinates: { lat: 38.9754, lon: -76.4851 }
      },
      camera: 'Leica M11 Monochrom',
      lens: 'Leica APO-Summicron-M 50mm f/2 ASPH',
      focalLength: '50mm',
      aperture: 'f/4.0',
      shutterSpeed: '1/500s',
      iso: 125
    },
    colorScience: {
      colorSpace: 'sRGB',
      dominantHex: ['#181818', '#737373', '#ffffff'],
      whitePoint: 'D65'
    },
    aspectRatio: '2:3',
    orientation: 'portrait',
    collections: ['black-and-white', 'maritime', 'minimalist'],
    limitedEdition: {
      isLimited: false,
      certificateOfAuthenticity: false
    }
  },
  {
    slug: 'minimalist-fog-isolated-beacon',
    title: 'Solitary Channel Marker No. 14',
    description:
      'A solitary green piling beacon suspended in dense coastal pea-soup fog over West Galveston Bay. Complete elimination of horizon divides transforms the bay into an ethereal, meditative spatial void.',
    capture: {
      date: '2025-12-04',
      location: {
        name: 'West Galveston Bay',
        region: 'Texas, USA',
        coordinates: { lat: 29.214, lon: -94.956 }
      },
      camera: 'Fujifilm GFX 100 II Medium Format',
      lens: 'Fujinon GF 110mm f/2 R LM WR',
      focalLength: '110mm',
      aperture: 'f/5.6',
      shutterSpeed: '1/125s',
      iso: 100
    },
    colorScience: {
      colorSpace: 'Adobe RGB 1998',
      dominantHex: ['#283848', '#475569', '#cbd5e1'],
      whitePoint: 'D50'
    },
    aspectRatio: '1:1',
    orientation: 'square',
    collections: ['minimalist', 'gulf-coast', 'coastal-geometry'],
    limitedEdition: {
      isLimited: false,
      certificateOfAuthenticity: false
    }
  },
  {
    slug: 'chesapeake-oyster-skiff-limited',
    title: 'Tangier Sound Deadrise at Ebb Tide',
    description:
      'Low tide along the muddy shallows of Tangier Sound. A hand-built wooden deadrise workboat rests on mud flats under an amber coastal sunset. Master numbered gallery release.',
    capture: {
      date: '2025-10-18',
      location: {
        name: 'Tangier Sound, Crisfield',
        region: 'Maryland, USA',
        coordinates: { lat: 37.9829, lon: -75.8566 }
      },
      camera: 'Fujifilm GFX 100 II Medium Format',
      lens: 'Fujinon GF 32-64mm f/4 R LM WR',
      focalLength: '38mm',
      aperture: 'f/8.0',
      shutterSpeed: '1/10s (tripod)',
      iso: 80
    },
    colorScience: {
      colorSpace: 'ProPhoto RGB',
      dominantHex: ['#181828', '#4b5563', '#d97706'],
      whitePoint: 'D50'
    },
    aspectRatio: '2:3',
    orientation: 'landscape',
    collections: ['chesapeake-heritage', 'limited-edition', 'maritime'],
    limitedEdition: {
      isLimited: true,
      editionSize: 30,
      certificateOfAuthenticity: true
    }
  }
];

function buildVariants(slug: string, isSquare: boolean, isPanoramic: boolean) {
  const code = slug.slice(0, 8).toUpperCase();
  const variants = [];

  // 1. Prodigi: Hahnemühle Photo Rag 308gsm (Fine-Art Giclée)
  variants.push({
    sku: `AWP-${code}-HAG-1624`,
    substrate: 'hahnemuhle-rag',
    substrateName: 'Hahnemühle Photo Rag 308gsm Fine-Art Giclée',
    size: isSquare ? '16x16' : isPanoramic ? '12x24' : '16x24',
    widthInches: isSquare ? 16 : isPanoramic ? 24 : 24,
    heightInches: isSquare ? 16 : isPanoramic ? 12 : 16,
    lab: 'prodigi',
    supplierSku: 'prodigi:GLOBAL-FAP-16x24',
    baseCostUsd: 34.0,
    retailPriceUsd: 125.0,
    inStock: true
  });

  variants.push({
    sku: `AWP-${code}-HAG-2436`,
    substrate: 'hahnemuhle-rag',
    substrateName: 'Hahnemühle Photo Rag 308gsm Fine-Art Giclée (Large Format)',
    size: isSquare ? '24x24' : isPanoramic ? '16x32' : '24x36',
    widthInches: isSquare ? 24 : isPanoramic ? 32 : 36,
    heightInches: isSquare ? 24 : isPanoramic ? 16 : 24,
    lab: 'prodigi',
    supplierSku: 'prodigi:GLOBAL-FAP-24x36',
    baseCostUsd: 58.0,
    retailPriceUsd: 210.0,
    inStock: true
  });

  // 2. Prodigi: Direct Metal Panel (ChromaLuxe Aluminum Float Mount)
  variants.push({
    sku: `AWP-${code}-MET-1624`,
    substrate: 'aluminum-panel',
    substrateName: 'ChromaLuxe Direct Aluminum Panel (Float Mount)',
    size: isSquare ? '16x16' : isPanoramic ? '12x24' : '16x24',
    widthInches: isSquare ? 16 : isPanoramic ? 24 : 24,
    heightInches: isSquare ? 16 : isPanoramic ? 12 : 16,
    lab: 'prodigi',
    supplierSku: 'prodigi:GLOBAL-MET-16x24',
    baseCostUsd: 48.0,
    retailPriceUsd: 185.0,
    inStock: true
  });

  // 3. Prodigi: HD Optical Acrylic Float Mount
  variants.push({
    sku: `AWP-${code}-ACR-2436`,
    substrate: 'acrylic-float',
    substrateName: 'Optical HD Acrylic Panel (Polished Beveled Edges)',
    size: isSquare ? '24x24' : isPanoramic ? '16x32' : '24x36',
    widthInches: isSquare ? 24 : isPanoramic ? 32 : 36,
    heightInches: isSquare ? 24 : isPanoramic ? 16 : 24,
    lab: 'prodigi',
    supplierSku: 'prodigi:GLOBAL-ACR-24x36',
    baseCostUsd: 92.0,
    retailPriceUsd: 340.0,
    inStock: true
  });

  // 4. Printify: Framed Exhibition Print
  variants.push({
    sku: `AWP-${code}-FRM-1624`,
    substrate: 'framed-print',
    substrateName: 'Matted Satin Black Hardwood Frame & Archival Mat',
    size: isSquare ? '16x16' : isPanoramic ? '12x24' : '16x24',
    widthInches: isSquare ? 16 : isPanoramic ? 24 : 24,
    heightInches: isSquare ? 16 : isPanoramic ? 12 : 16,
    lab: 'printify',
    supplierSku: 'printify:FRAMED-POSTER-1624',
    baseCostUsd: 42.0,
    retailPriceUsd: 145.0,
    inStock: true
  });

  // 5. Printful: Museum Canvas Wrap
  variants.push({
    sku: `AWP-${code}-CNV-1624`,
    substrate: 'stretched-canvas',
    substrateName: 'Museum Heavyweight Stretched Canvas Wrap (1.5")',
    size: isSquare ? '16x16' : isPanoramic ? '12x24' : '16x24',
    widthInches: isSquare ? 16 : isPanoramic ? 24 : 24,
    heightInches: isSquare ? 16 : isPanoramic ? 12 : 16,
    lab: 'printful',
    supplierSku: 'printful:CANVAS-WRAP-1624',
    baseCostUsd: 38.0,
    retailPriceUsd: 135.0,
    inStock: true
  });

  // 6. Gelato: Archival Linen Art Cards
  variants.push({
    sku: `AWP-${code}-CRD-A6`,
    substrate: 'linen-art-cards',
    substrateName: 'Collector Box of 8 Archival Linen Art Cards (A6)',
    size: 'A6 Pack (4.1" x 5.8")',
    widthInches: 5.8,
    heightInches: 4.1,
    lab: 'gelato',
    supplierSku: 'gelato:CARDS-A6-BOX8',
    baseCostUsd: 6.5,
    retailPriceUsd: 28.0,
    inStock: true
  });

  // 7. Printify: Studio Desk Mat
  variants.push({
    sku: `AWP-${code}-DSK-3515`,
    substrate: 'desk-mat',
    substrateName: 'Studio Neoprene Desk Mat (35.4" x 15.7" Stitched Edges)',
    size: '35.4" x 15.7"',
    widthInches: 35.4,
    heightInches: 15.7,
    lab: 'printify',
    supplierSku: 'printify:DESK-MAT-900400',
    baseCostUsd: 12.0,
    retailPriceUsd: 42.0,
    inStock: true
  });

  return variants;
}

for (const meta of artworksMeta) {
  const p = manifest.find((m) => m.slug === meta.slug);
  if (!p) {
    console.warn(`No preflight manifest found for ${meta.slug}`);
    continue;
  }

  const isSquare = meta.aspectRatio === '1:1';
  const isPanoramic = meta.aspectRatio === '16:9' || meta.aspectRatio === 'panoramic';

  const doc = {
    id: uuidv7(),
    title: meta.title,
    slug: meta.slug,
    description: meta.description,
    capture: meta.capture,
    colorScience: meta.colorScience,
    dimensions: {
      widthPx: p.nativeWidth,
      heightPx: p.nativeHeight,
      aspectRatio: meta.aspectRatio,
      orientation: meta.orientation
    },
    collections: meta.collections,
    limitedEdition: meta.limitedEdition,
    masterAsset: {
      sourcePath: `/assets/source-images/${p.slug}.png`,
      tiffMasterPath: p.tiffMasterPath,
      maxDpiPaperWidthInches: p.maxPaperWidthInches,
      maxDpiPaperHeightInches: p.maxPaperHeightInches,
      maxDpiMetalWidthInches: p.maxMetalWidthInches,
      maxDpiMetalHeightInches: p.maxMetalHeightInches
    },
    previewImage: p.previewWebpPath,
    framedMockup: p.mockupWebpPath,
    variants: buildVariants(meta.slug, isSquare, isPanoramic)
  };

  const filePath = path.join(ARTWORKS_DIR, `${meta.slug}.json`);
  fs.writeFileSync(filePath, JSON.stringify(doc, null, 2), 'utf-8');
  console.log(`Wrote catalog entry: ${filePath}`);
}

// Also emit unified public/data/artworks.json for edge endpoints
const PUBLIC_DATA_DIR = path.resolve('public/data');
if (!fs.existsSync(PUBLIC_DATA_DIR)) {
  fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
}

const allArtworks = fs
  .readdirSync(ARTWORKS_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(ARTWORKS_DIR, f), 'utf-8')));

fs.writeFileSync(
  path.join(PUBLIC_DATA_DIR, 'artworks.json'),
  JSON.stringify(allArtworks, null, 2),
  'utf-8'
);
console.log(`Unified catalog compiled to public/data/artworks.json (${allArtworks.length} artworks).`);
