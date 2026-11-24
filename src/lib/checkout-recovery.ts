/**
 * Browser-safe cart recovery for checkout.
 * Corrupt localStorage payloads become an empty cart.
 * Stale SKUs stay in the cart until the buyer removes them.
 */

import type { CartItem, ProviderId } from '../stores/cart';

const PROVIDERS: readonly ProviderId[] = ['prodigi', 'printful', 'printify', 'gelato', 'gooten'];
const PACKAGING: readonly CartItem['packagingType'][] = [
  'rigid_tube',
  'flat_crate',
  'corrugated_box',
  'poly_mailer',
];

export type CheckoutSkuFailureCode = 'unresolved_sku' | 'unapproved_sku';

export interface CheckoutSkuFailure {
  error?: string;
  code?: string;
  sku?: string;
  itemId?: string;
}

function isProvider(value: unknown): value is ProviderId {
  return typeof value === 'string' && PROVIDERS.includes(value as ProviderId);
}

function isPackaging(value: unknown): value is CartItem['packagingType'] {
  return typeof value === 'string' && PACKAGING.includes(value as CartItem['packagingType']);
}

function readText(value: unknown, max = 240): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text || text.length > max) return '';
  return text;
}

function readImageSrc(value: unknown): string {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw || raw.length > 500) return '';
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\')) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
  } catch {
    return '';
  }
  return '';
}

function readAlternative(value: unknown): CartItem['consolidationAlternative'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const alt = value as Record<string, unknown>;
  if (!isProvider(alt.provider) || !isPackaging(alt.packagingType)) return undefined;
  const sku = readText(alt.sku, 120);
  const variantTitle = readText(alt.variantTitle);
  if (!sku || !variantTitle) return undefined;
  if (typeof alt.price !== 'number' || !Number.isFinite(alt.price) || alt.price < 0) return undefined;
  if (typeof alt.estimatedFreightSaved !== 'number' || !Number.isFinite(alt.estimatedFreightSaved)) {
    return undefined;
  }
  return {
    provider: alt.provider,
    sku,
    variantTitle,
    price: alt.price,
    packagingType: alt.packagingType,
    estimatedFreightSaved: alt.estimatedFreightSaved,
  };
}

function readCartItem(value: unknown): CartItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = readText(raw.id, 240);
  const artworkId = readText(raw.artworkId, 80);
  const sku = readText(raw.sku, 120);
  if (!id || !artworkId || !sku || !isProvider(raw.provider) || !isPackaging(raw.packagingType)) {
    return null;
  }
  if (typeof raw.price !== 'number' || !Number.isFinite(raw.price) || raw.price < 0) return null;
  const quantity = raw.quantity;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    return null;
  }

  const item: CartItem = {
    id,
    artworkId,
    artworkTitle: readText(raw.artworkTitle),
    variantTitle: readText(raw.variantTitle),
    sku,
    provider: raw.provider,
    packagingType: raw.packagingType,
    price: raw.price,
    quantity,
    imageSrc: readImageSrc(raw.imageSrc),
  };
  const alternative = readAlternative(raw.consolidationAlternative);
  if (alternative) item.consolidationAlternative = alternative;
  return item;
}

/** Parse awp_cart_items. Invalid JSON, empty text, and non-arrays become []. */
export function readStoredCartItems(raw: string | null | undefined): CartItem[] {
  if (raw == null) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const items: CartItem[] = [];
  for (const entry of parsed) {
    const item = readCartItem(entry);
    if (item) items.push(item);
  }
  return items;
}

/** True when localStorage should be rewritten with the sanitized cart. */
export function storedCartNeedsHeal(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return true;
  }
  if (!Array.isArray(parsed)) return true;
  return JSON.stringify(parsed) !== JSON.stringify(readStoredCartItems(raw));
}

export function isRecoverableCartFailure(failure: CheckoutSkuFailure): boolean {
  if (failure.code === 'unresolved_sku' || failure.code === 'unapproved_sku') return true;
  const error = failure.error || '';
  return /pricing matrix|unknown lab prefix|missing a catalog id|not a published catalog size|not approved|rejected for this image|not enabled for this store|SKU is missing/i.test(
    error
  );
}

/** Pick the cart row that blocked checkout. itemId wins, then sku, then the error text. */
export function identifyUnavailableCartItem<T extends { id: string; sku: string }>(
  items: readonly T[],
  failure: CheckoutSkuFailure
): T | null {
  if (!items.length || !isRecoverableCartFailure(failure)) return null;
  const itemId = (failure.itemId || '').trim();
  if (itemId) {
    const byId = items.find((item) => item.id === itemId);
    if (byId) return byId;
  }
  const sku = (failure.sku || '').trim();
  if (sku) {
    const bySku = items.find((item) => item.sku === sku);
    if (bySku) return bySku;
  }
  const error = failure.error || '';
  const ranked = [...items].sort((a, b) => b.sku.length - a.sku.length);
  for (const item of ranked) {
    if (item.sku && error.includes(item.sku)) return item;
  }
  if (items.length === 1) return items[0];
  return null;
}

export function escapeCheckoutText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CHECKOUT_NONCE_KEY = 'awp_checkout_nonce';
const CHECKOUT_NONCE_FINGERPRINT_KEY = 'awp_checkout_nonce_fingerprint';

export interface CheckoutNonceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Order-insensitive fingerprint of a cart's billable contents. */
export function cartFingerprint(items: readonly { id: string; sku: string; quantity: number }[]): string {
  return items
    .map((item) => `${item.id}:${item.sku}:${item.quantity}`)
    .sort()
    .join('|');
}

function randomNonce(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Reuse the stored attempt nonce while the cart is unchanged, so a reload or a
 * double-submit within the same cart reuses the same Stripe idempotency key.
 * Any change to the cart contents mints and persists a new nonce.
 */
export function getOrCreateCheckoutNonce(
  items: readonly { id: string; sku: string; quantity: number }[],
  storage: CheckoutNonceStorage
): string {
  const fingerprint = cartFingerprint(items);
  const storedFingerprint = storage.getItem(CHECKOUT_NONCE_FINGERPRINT_KEY);
  const storedNonce = storage.getItem(CHECKOUT_NONCE_KEY);
  if (storedFingerprint === fingerprint && storedNonce) {
    return storedNonce;
  }
  const nonce = randomNonce();
  storage.setItem(CHECKOUT_NONCE_KEY, nonce);
  storage.setItem(CHECKOUT_NONCE_FINGERPRINT_KEY, fingerprint);
  return nonce;
}

/** Share one in-flight checkout mount. A later call starts a new mount. */
export function createCheckoutFlightGuard() {
  let current: Promise<void> | null = null;
  return {
    start(task: () => Promise<void>): Promise<void> {
      if (current) return current;
      const run = task().finally(() => {
        if (current === run) current = null;
      });
      current = run;
      return run;
    },
  };
}
