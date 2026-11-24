/**
 * Shared embedded Checkout session creator.
 * Charges catalog retail in USD only.
 * Returns clientSecret + publishableKey, or a local simulated payload when
 * ALLOW_SIMULATED_CHECKOUT is explicitly enabled. Production must not set that flag.
 */

import Stripe from 'stripe';
import type { OrderItem } from './fulfillment';
import { getPublishedArtworkSlugs } from './artwork-catalog';
import {
  artworkCropsForSlug,
  catalogUnitAmountCents,
  describeUnresolvedSku,
  enabledStorefrontLabs,
  isArtworkSlug,
  labFromVendor,
  mapCategoryToSubstrate,
  normalizeSize,
  resolveCropSelection,
  resolveMatrixSku,
  resolvePrintAssetUrl,
  type PricingMatrixEntry,
  type PrintAssetConfig,
} from './checkout-catalog';

export type { PricingMatrixEntry };

export interface CheckoutCartItem {
  id: string;
  sku: string;
  artworkId: string;
  artworkTitle: string;
  variantTitle: string;
  price: number;
  quantity: number;
  provider: string;
  packagingType: string;
  imageSrc?: string;
}

export interface CreateCheckoutSessionInput {
  items: CheckoutCartItem[];
  customerEmail?: string;
  origin: string;
  stripeSecretKey?: string;
  stripePublishableKey?: string;
  pricingMatrix: Record<string, PricingMatrixEntry>;
  /** Local sandbox only. Production callers must leave this unset. */
  allowSimulatedCheckout?: boolean;
  printMastersBaseUrl?: string;
  printMastersExtension?: string;
  /** Explicit opt-in. Leave unset so labs never receive the clean webp preview. */
  allowCleanPreviewAssets?: boolean;
  publishedSlugs?: ReadonlySet<string>;
  /** Extra labs from CHECKOUT_ENABLED_VENDORS. Printful and Gelato stay off until named. */
  enabledVendors?: readonly string[] | null;
  /** Buyer shipping countries. Defaults to US-only; overridable via CHECKOUT_ALLOWED_COUNTRIES. */
  allowedCountries?: readonly string[] | null;
  /**
   * Per-cart attempt nonce from the client. Combined with the cart contents into a
   * deterministic Stripe idempotency key so page reloads or double-submits within
   * the same cart reuse the same Checkout Session instead of creating duplicates.
   */
  attemptNonce?: string;
}

export interface CreateCheckoutSessionResult {
  status: number;
  body: Record<string, unknown>;
}

export interface PreparedCheckoutLine {
  orderItem: OrderItem;
  matrixSku: string;
  category: string;
  variantTitle: string;
  packagingType: string;
  productMetadata: Record<string, string>;
}

export type CheckoutSkuFailureCode = 'unresolved_sku' | 'unapproved_sku';

export type PrepareCheckoutResult =
  | { ok: true; orderItems: OrderItem[]; lines: PreparedCheckoutLine[] }
  | {
      ok: false;
      status: number;
      error: string;
      code?: CheckoutSkuFailureCode;
      sku?: string;
      itemId?: string;
    };

function isPlaceholderSecret(key: string | undefined): boolean {
  return !key || key.includes('placeholder') || key === 'sk_test_placeholder';
}

function clientPriceCents(price: number): number | null {
  if (typeof price !== 'number' || !Number.isFinite(price)) return null;
  const cents = Math.round(price * 100);
  if (!Number.isSafeInteger(cents)) return null;
  return cents;
}

export type CheckoutAssetConfig = PrintAssetConfig & {
  publishedSlugs?: ReadonlySet<string>;
  artworkCrops?: Record<string, Record<string, unknown>>;
  enabledVendors?: readonly string[] | null;
};

function skuFailure(
  code: CheckoutSkuFailureCode,
  error: string,
  item: CheckoutCartItem,
  sku?: string
): PrepareCheckoutResult {
  return {
    ok: false,
    status: 400,
    error,
    code,
    sku: (sku || item.sku || '').trim(),
    itemId: (item.id || '').trim(),
  };
}

/** Resolve cart rows to catalog-priced fulfillment items. Rejects unknown SKUs and price mismatches. */
export function prepareCheckoutCart(
  items: CheckoutCartItem[],
  matrix: Record<string, PricingMatrixEntry>,
  origin: string,
  config: CheckoutAssetConfig = {}
): PrepareCheckoutResult {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, status: 400, error: 'Cart is empty' };
  }
  if (items.length > 20) {
    return { ok: false, status: 400, error: 'Cart exceeds the 20 item limit' };
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return { ok: false, status: 400, error: 'Checkout origin is invalid' };
  }
  if (parsedOrigin.protocol !== 'https:' && parsedOrigin.protocol !== 'http:') {
    return { ok: false, status: 400, error: 'Checkout origin is invalid' };
  }

  const lines: PreparedCheckoutLine[] = [];
  const enabledLabs = enabledStorefrontLabs(config.enabledVendors);

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!item || typeof item !== 'object') {
      return { ok: false, status: 400, error: 'Malformed cart item' };
    }

    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      return { ok: false, status: 400, error: 'Item quantity must be an integer from 1 to 10' };
    }

    const artworkSlug = (item.artworkId || '').trim().toLowerCase();
    if (!isArtworkSlug(artworkSlug)) {
      return { ok: false, status: 400, error: 'Artwork slug is not a published print id' };
    }
    const published = config.publishedSlugs ?? getPublishedArtworkSlugs();
    if (!published.has(artworkSlug)) {
      return { ok: false, status: 400, error: 'Artwork slug is not in the print catalog' };
    }

    const matrixSku = resolveMatrixSku(item.sku || '', matrix);
    if (!matrixSku) {
      return skuFailure('unresolved_sku', describeUnresolvedSku(item.sku || '', matrix), item);
    }

    const canonical = matrix[matrixSku];
    const unitPriceCents = catalogUnitAmountCents(canonical);
    const lab = labFromVendor(canonical.vendor);
    const size = normalizeSize(canonical.size || '');
    if (unitPriceCents == null || !lab || !size) {
      return skuFailure(
        'unresolved_sku',
        `Pricing matrix entry is incomplete: ${matrixSku}`,
        item,
        matrixSku
      );
    }

    if (!enabledLabs.has(lab)) {
      const vendorName = (canonical.vendor || '').trim();
      const reason = vendorName
        ? `${vendorName} fulfillment is not enabled for this store.`
        : 'Fulfillment for this lab is not enabled for this store.';
      return skuFailure(
        'unapproved_sku',
        `Cart SKU ${item.sku || matrixSku} is not available. ${reason}`,
        item,
        item.sku || matrixSku
      );
    }

    const submitted = clientPriceCents(item.price);
    if (submitted == null || submitted !== unitPriceCents) {
      return {
        ok: false,
        status: 400,
        error: `Price for ${item.sku} does not match the catalog (${(unitPriceCents / 100).toFixed(2)} USD)`,
      };
    }

    const supplierSku = `${lab}:${matrixSku}`;
    // Crop path when size, ratio, or artwork mapping names a variant. Uncropped master is
    // allowed only when merch_crops.__uncropped.approved_products explicitly approves this SKU.
    const selection = resolveCropSelection({
      size,
      sku: `${supplierSku} ${matrixSku}`,
      crops: artworkCropsForSlug(artworkSlug, config.artworkCrops),
    });
    if (!selection.ok) {
      return skuFailure('unapproved_sku', selection.error, item);
    }
    const printAsset = resolvePrintAssetUrl(parsedOrigin.origin, artworkSlug, config, selection.crop, lab);
    if (!printAsset.ok) {
      return { ok: false, status: 400, error: printAsset.error };
    }
    const printAssetUrl = printAsset.url;
    // Client item.provider is ignored. The pricing matrix vendor is the only lab.
    const productMetadata: Record<string, string> = {
      sku: item.sku,
      matrixSku,
      supplierSku,
      artworkSlug,
      artworkId: artworkSlug,
      provider: lab,
      packagingType: item.packagingType || '',
      size,
      category: canonical.category || '',
      unitAmountCents: String(unitPriceCents),
    };
    if (selection.crop) productMetadata.crop = selection.crop;
    if (selection.ratio) productMetadata.cropRatio = selection.ratio;

    const orderItem: OrderItem = {
      id: item.id || `${artworkSlug}-${matrixSku}-${index}`,
      sku: item.sku,
      artworkId: artworkSlug,
      artworkTitle: item.artworkTitle || artworkSlug,
      substrate: mapCategoryToSubstrate(canonical.category || ''),
      size,
      quantity,
      unitPriceCents,
      lab,
      supplierSku,
      printAssetUrl,
    };

    lines.push({
      orderItem,
      matrixSku,
      category: canonical.category || '',
      variantTitle: item.variantTitle || size,
      packagingType: item.packagingType || '',
      productMetadata,
    });
  }

  return {
    ok: true,
    orderItems: lines.map((line) => line.orderItem),
    lines,
  };
}

/** Compact fulfillment payload for session.metadata.items (Stripe 500-char value limit). */
export function buildFulfillmentMetadataItems(
  items: CheckoutCartItem[],
  matrix: Record<string, PricingMatrixEntry>,
  origin: string,
  config: CheckoutAssetConfig = {}
): OrderItem[] {
  const prepared = prepareCheckoutCart(items, matrix, origin, config);
  if (!prepared.ok) {
    throw new Error(prepared.error);
  }
  return prepared.orderItems;
}

/** Session metadata. The compact items payload is omitted once it passes Stripe's 500 character cap. */
export function buildCheckoutSessionMetadata(orderItems: OrderItem[]): Record<string, string> {
  const itemsJson = JSON.stringify(orderItems);
  return {
    item_count: String(orderItems.length),
    source: 'alanwoodyard.photo',
    currency: 'usd',
    ...(itemsJson.length <= 500 ? { items: itemsJson } : {}),
  };
}

const DEFAULT_ALLOWED_COUNTRIES: readonly string[] = ['US'];
const CHECKOUT_SESSION_EXPIRY_SECONDS = 4 * 60 * 60; // 4 hours, within Stripe's 30min-24h window.

/**
 * Deterministic idempotency key from the cart contents plus a per-cart attempt nonce.
 * A page reload or double-submit with the same cart and nonce reuses the same
 * Stripe Checkout Session instead of creating a duplicate.
 */
export async function computeCheckoutIdempotencyKey(
  items: readonly CheckoutCartItem[],
  attemptNonce: string
): Promise<string> {
  const normalized = items
    .map((item) => `${item.id}:${item.sku}:${item.quantity}:${item.price}`)
    .sort()
    .join('|');
  const encoder = new TextEncoder();
  const data = encoder.encode(`${normalized}#${attemptNonce || ''}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `awp_checkout_${hash.slice(0, 32)}`;
}

/**
 * Pure Stripe session param builder, kept separate from the network call so the
 * phone/expiry/shipping-country defaults are unit-testable without hitting Stripe.
 */
export function buildStripeSessionParams(
  prepared: { lines: PreparedCheckoutLine[]; orderItems: OrderItem[] },
  input: { origin: string; customerEmail?: string; allowedCountries?: readonly string[] | null },
  nowMs = Date.now()
): Stripe.Checkout.SessionCreateParams {
  const allowedCountries =
    input.allowedCountries && input.allowedCountries.length > 0
      ? [...input.allowedCountries]
      : [...DEFAULT_ALLOWED_COUNTRIES];

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = prepared.lines.map((line) => ({
    price_data: {
      currency: 'usd',
      unit_amount: line.orderItem.unitPriceCents,
      product_data: {
        name: `${line.orderItem.artworkTitle} - ${line.variantTitle}`,
        metadata: line.productMetadata,
      },
    },
    quantity: line.orderItem.quantity,
  }));

  return {
    ui_mode: 'embedded',
    mode: 'payment',
    line_items,
    customer_email: input.customerEmail || undefined,
    shipping_address_collection: {
      allowed_countries: allowedCountries as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
    },
    phone_number_collection: { enabled: true },
    expires_at: Math.floor(nowMs / 1000) + CHECKOUT_SESSION_EXPIRY_SECONDS,
    metadata: buildCheckoutSessionMetadata(prepared.orderItems),
    return_url: `${input.origin}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
  };
}

export async function createEmbeddedCheckoutSession(
  input: CreateCheckoutSessionInput
): Promise<CreateCheckoutSessionResult> {
  const { items, customerEmail, origin, stripeSecretKey, stripePublishableKey, pricingMatrix } =
    input;
  const assetConfig: CheckoutAssetConfig = {
    printMastersBaseUrl: input.printMastersBaseUrl,
    printMastersExtension: input.printMastersExtension,
    allowCleanPreviewAssets: input.allowCleanPreviewAssets,
    publishedSlugs: input.publishedSlugs,
    enabledVendors: input.enabledVendors,
  };

  const prepared = prepareCheckoutCart(items, pricingMatrix, origin, assetConfig);
  if (!prepared.ok) {
    return {
      status: prepared.status,
      body: {
        error: prepared.error,
        ...(prepared.code
          ? {
              code: prepared.code,
              sku: prepared.sku || '',
              itemId: prepared.itemId || '',
            }
          : {}),
      },
    };
  }

  if (isPlaceholderSecret(stripeSecretKey)) {
    if (input.allowSimulatedCheckout === true) {
      return {
        status: 200,
        body: {
          returnUrl: `/order-confirmation?session_id=cs_test_simulated_${Date.now()}`,
          simulated: true,
        },
      };
    }
    return {
      status: 503,
      body: { error: 'STRIPE_SECRET_KEY is not configured' },
    };
  }

  if (!stripePublishableKey || stripePublishableKey.includes('placeholder')) {
    return {
      status: 503,
      body: { error: 'STRIPE_PUBLIC_KEY is not configured' },
    };
  }

  const stripe = new Stripe(stripeSecretKey as string, {
    // Pin to the account's Checkout API revision used elsewhere in this repo.
    apiVersion: '2024-12-18.acacia' as any,
  });

  const sessionParams = buildStripeSessionParams(prepared, {
    origin,
    customerEmail,
    allowedCountries: input.allowedCountries,
  });
  const idempotencyKey = await computeCheckoutIdempotencyKey(items, input.attemptNonce || '');
  const session = await stripe.checkout.sessions.create(sessionParams, { idempotencyKey });

  return {
    status: 200,
    body: {
      clientSecret: session.client_secret,
      publishableKey: stripePublishableKey,
      simulated: false,
    },
  };
}
