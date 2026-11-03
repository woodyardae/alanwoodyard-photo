/**
 * src/lib/analytics.ts
 *
 * Sovereign Umami Analytics Client Dispatcher for chantecler-01:3008
 * Dispatches custom telemetry events for collector interactions:
 * - view_artwork
 * - filter_collection
 * - select_print_size
 * - initiate_checkout
 */

declare global {
  interface Window {
    umami?: {
      track: (eventName: string, eventData?: Record<string, unknown>) => void;
    };
  }
}

export interface ViewArtworkData {
  artworkId: string;
  slug: string;
  title: string;
  collection: string;
  colorSpace: string;
}

export interface FilterCollectionData {
  collection: string;
  artworkCount: number;
}

export interface SelectPrintSizeData {
  artworkId: string;
  slug: string;
  substrate: string;
  size: string;
  priceUsd: number;
  lab: string;
}

export interface InitiateCheckoutData {
  itemCount: number;
  totalUsd: number;
  substrates: string[];
  vendorCount: number;
  multiVendor: boolean;
}

/**
 * Safe Umami event dispatcher
 */
function safeTrack(eventName: string, eventData: Record<string, unknown>) {
  if (typeof window !== 'undefined' && window.umami && typeof window.umami.track === 'function') {
    try {
      window.umami.track(eventName, eventData);
    } catch (e) {
      console.warn(`[Umami Analytics] Failed to track ${eventName}:`, e);
    }
  } else {
    // In local development or before script load, log cleanly to console
    if ((import.meta as any).env?.DEV) {
      console.log(`[Telemetry Event: ${eventName}]`, eventData);
    }
  }
}

export function trackViewArtwork(data: ViewArtworkData) {
  safeTrack('view_artwork', {
    artwork_id: data.artworkId,
    slug: data.slug,
    title: data.title,
    collection: data.collection,
    color_space: data.colorSpace
  });
}

export function trackFilterCollection(data: FilterCollectionData) {
  safeTrack('filter_collection', {
    collection: data.collection,
    artwork_count: data.artworkCount
  });
}

export function trackSelectPrintSize(data: SelectPrintSizeData) {
  safeTrack('select_print_size', {
    artwork_id: data.artworkId,
    slug: data.slug,
    substrate: data.substrate,
    size: data.size,
    price_usd: data.priceUsd,
    lab: data.lab
  });
}

export function trackInitiateCheckout(data: InitiateCheckoutData) {
  safeTrack('initiate_checkout', {
    item_count: data.itemCount,
    total_usd: data.totalUsd,
    substrates: data.substrates.join(','),
    vendor_count: data.vendorCount,
    multi_vendor: data.multiVendor
  });
}
