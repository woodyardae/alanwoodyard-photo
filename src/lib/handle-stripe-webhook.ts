/**
 * Shared Stripe webhook handler.
 * Fail-closed signature verification, then route paid USD orders via the fulfillment engine.
 * Never enables ALLOW_MOCK_DISPATCH; production must provide real lab API credentials.
 * metadata.provider cannot select a lab other than the pricing matrix vendor.
 */

import { getPublishedArtworkSlugs } from './artwork-catalog';
import { saveDispatchReceipt, readDispatchReceipt } from './dispatch-ledger';
import {
  deliverOrderNotifications,
  type DispatchNotice,
  type NotificationEnv,
} from './notifications';
import { verifyWebhookSignature } from './security';
import {
  routeOrder,
  type FulfillmentEnv,
  type FulfillmentOrder,
  type OrderItem,
  type OrderRoutingResult,
} from './fulfillment';
import {
  artworkCropsForSlug,
  catalogUnitAmountCents,
  isArtworkSlug,
  labFromVendor,
  mapCategoryToSubstrate,
  normalizeSize,
  resolveCropSelection,
  resolvePrintAssetUrl,
  type PricingMatrixEntry,
  type PrintAssetConfig,
} from './checkout-catalog';

export interface StripeWebhookEnv extends FulfillmentEnv, NotificationEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  PRINT_MASTERS_BASE_URL?: string;
  PRINT_MASTERS_EXTENSION?: string;
  ALLOW_CLEAN_PREVIEW_ASSETS?: string;
  pricingMatrix?: Record<string, PricingMatrixEntry>;
  publishedSlugs?: ReadonlySet<string>;
  artworkCrops?: Record<string, Record<string, unknown>>;
}

export interface HandleStripeWebhookResult {
  status: number;
  body: Record<string, unknown>;
}

interface StripeLineItemProduct {
  metadata?: Record<string, string>;
  name?: string;
}

interface StripeLineItem {
  quantity?: number | null;
  amount_total?: number | null;
  currency?: string | null;
  price?: {
    product?: string | StripeLineItemProduct;
    unit_amount?: number | null;
    currency?: string | null;
  } | null;
}

interface StripeCheckoutSession {
  id: string;
  payment_status?: string | null;
  currency?: string | null;
  amount_total?: number | null;
  amount_subtotal?: number | null;
  customer_details?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: {
      line1?: string | null;
      line2?: string | null;
      city?: string | null;
      state?: string | null;
      postal_code?: string | null;
      country?: string | null;
    } | null;
  } | null;
  shipping_details?: {
    name?: string | null;
    address?: {
      line1?: string | null;
      line2?: string | null;
      city?: string | null;
      state?: string | null;
      postal_code?: string | null;
      country?: string | null;
    } | null;
  } | null;
  metadata?: Record<string, string> | null;
}

function parseMetadataItems(raw: string | undefined): OrderItem[] | null {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as OrderItem[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeAssetUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function assetConfigFromEnv(env: StripeWebhookEnv): PrintAssetConfig {
  return {
    printMastersBaseUrl: env.PRINT_MASTERS_BASE_URL,
    printMastersExtension: env.PRINT_MASTERS_EXTENSION,
    allowCleanPreviewAssets: env.ALLOW_CLEAN_PREVIEW_ASSETS === '1',
  };
}

function orderItemsFromLineItems(
  lineItems: StripeLineItem[],
  origin: string,
  sessionId: string,
  matrix: Record<string, PricingMatrixEntry>,
  assetConfig: PrintAssetConfig,
  publishedSlugs: ReadonlySet<string>,
  artworkCrops?: Record<string, Record<string, unknown>>
): { items: OrderItem[] } | { error: string } {
  const items: OrderItem[] = [];

  for (let i = 0; i < lineItems.length; i++) {
    const line = lineItems[i];
    const product =
      line.price?.product && typeof line.price.product === 'object'
        ? line.price.product
        : undefined;
    const meta = product?.metadata || {};
    const sku = meta.sku || '';
    const artworkSlug = (meta.artworkSlug || meta.artworkId || '').trim().toLowerCase();
    const matrixSku = meta.matrixSku || '';
    const canonical = matrix[matrixSku];
    const expectedCents = canonical ? catalogUnitAmountCents(canonical) : null;
    const catalogLab = canonical ? labFromVendor(canonical.vendor) : null;
    const quantity = line.quantity;
    const unitPriceCents = line.price?.unit_amount;
    const lineCurrency = (line.currency || line.price?.currency || '').toLowerCase();

    if (!sku || !matrixSku || !canonical || expectedCents == null || !catalogLab) {
      return { error: 'Line item is missing a catalog SKU' };
    }
    if ((meta.provider || '').trim()) {
      const claimed = labFromVendor(meta.provider);
      if (claimed !== catalogLab) {
        return { error: 'Line item provider does not match the catalog vendor' };
      }
    }
    const lab = catalogLab;
    if (!isArtworkSlug(artworkSlug)) {
      return { error: 'Line item artwork slug is not a published print id' };
    }
    if (!publishedSlugs.has(artworkSlug)) {
      return { error: 'Artwork slug is not in the print catalog' };
    }
    if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 10) {
      return { error: 'Line item quantity is outside 1 to 10' };
    }
    if (lineCurrency !== 'usd') {
      return { error: 'Line item currency must be usd' };
    }
    if (unitPriceCents !== expectedCents) {
      return { error: `Charged amount for ${sku} does not match the catalog` };
    }
    if (meta.unitAmountCents && Number(meta.unitAmountCents) !== unitPriceCents) {
      return { error: `Charged amount for ${sku} does not match session metadata` };
    }
    if (meta.artworkSlug && meta.artworkSlug !== artworkSlug) {
      return { error: 'Line item artwork slug does not match session metadata' };
    }

    const supplierSku = `${lab}:${matrixSku}`;
    if (meta.supplierSku && meta.supplierSku !== supplierSku) {
      return { error: `Supplier SKU for ${sku} does not match the catalog` };
    }

    const catalogSize = normalizeSize(canonical.size || '');
    if (!catalogSize) return { error: `Size is missing for ${sku}` };
    const metaSize = normalizeSize(meta.size || '');
    if (metaSize && metaSize !== catalogSize) {
      return { error: `Size for ${sku} does not match the catalog` };
    }
    const size = catalogSize;

    // Re-resolve from catalog size, SKU, and artwork crops. Uncropped /masters/{slug}.{ext}
    // requires merch_crops.__uncropped.approved_products approval for this SKU.
    const selection = resolveCropSelection({
      size,
      sku: `${supplierSku} ${matrixSku}`,
      ratio: meta.cropRatio || meta.ratio,
      crops: artworkCropsForSlug(artworkSlug, artworkCrops),
    });
    if (!selection.ok) return { error: selection.error };
    const metaCrop = (meta.crop || '').trim();
    if (metaCrop && metaCrop !== (selection.crop || '')) {
      return { error: 'Line item crop does not match the catalog size' };
    }

    const printAsset = resolvePrintAssetUrl(origin, artworkSlug, assetConfig, selection.crop);
    if (!printAsset.ok) {
      return { error: printAsset.error };
    }

    items.push({
      id: `${sessionId}-${sku}-${i}`,
      sku,
      artworkId: artworkSlug,
      artworkTitle: product?.name || artworkSlug,
      substrate: mapCategoryToSubstrate(meta.category || canonical.category || ''),
      size,
      quantity: quantity as number,
      unitPriceCents,
      lab,
      supplierSku,
      printAssetUrl: printAsset.url,
    });
  }

  if (items.length === 0) {
    return { error: 'No routable line items found on session' };
  }
  return { items };
}

function metadataAgrees(metadataItems: OrderItem[], lineItems: OrderItem[]): string | null {
  if (metadataItems.length !== lineItems.length) {
    return 'Fulfillment metadata does not match the paid line items';
  }
  for (let i = 0; i < lineItems.length; i++) {
    const stored = metadataItems[i];
    const paid = lineItems[i];
    const storedSlug = (stored?.artworkId || '').trim().toLowerCase();
    const storedAsset = stored?.printAssetUrl ? normalizeAssetUrl(stored.printAssetUrl) : '';
    const paidAsset = normalizeAssetUrl(paid.printAssetUrl);
    if (
      !stored ||
      stored.sku !== paid.sku ||
      storedSlug !== paid.artworkId ||
      stored.quantity !== paid.quantity ||
      stored.unitPriceCents !== paid.unitPriceCents ||
      stored.supplierSku !== paid.supplierSku ||
      stored.lab !== paid.lab ||
      storedAsset !== paidAsset
    ) {
      return 'Fulfillment metadata does not match the paid line items';
    }
  }
  return null;
}

async function listSessionLineItems(
  sessionId: string,
  stripeSecretKey: string
): Promise<StripeLineItem[]> {
  const params = new URLSearchParams();
  params.set('limit', '100');
  params.append('expand[]', 'data.price.product');

  const res = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?${params}`,
    {
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stripe line-item lookup failed HTTP ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { data?: StripeLineItem[] };
  return data.data || [];
}

function buildOrderFromSession(
  session: StripeCheckoutSession,
  items: OrderItem[]
): FulfillmentOrder {
  const shipping = session.shipping_details;
  const customer = session.customer_details;
  const address = shipping?.address || customer?.address;

  return {
    sessionId: session.id,
    orderNumber: `AWP-${session.id.slice(-8).toUpperCase()}`,
    recipient: {
      name: shipping?.name || customer?.name || 'Art Collector',
      email: customer?.email || '',
      phone: customer?.phone || '',
      address1: address?.line1 || '',
      address2: address?.line2 || '',
      city: address?.city || '',
      state: address?.state || '',
      postalCode: address?.postal_code || '',
      countryCode: address?.country || 'US',
    },
    items,
    currency: 'USD',
  };
}

function noticeFromOrder(
  kind: DispatchNotice['kind'],
  order: FulfillmentOrder,
  fulfillment: OrderRoutingResult
): DispatchNotice {
  return {
    kind,
    sessionId: order.sessionId,
    customerEmail: order.recipient.email || '',
    destinationCountry: order.recipient.countryCode || '',
    skus: order.items.map((item) => item.sku),
    supplierOrderIds: fulfillment.parcels
      .map((parcel) => parcel.labOrderId || '')
      .filter((id) => id.length > 0),
    errors: fulfillment.errors,
  };
}

function liveFulfillmentEnv(env: StripeWebhookEnv): FulfillmentEnv {
  const fulfillmentEnv: FulfillmentEnv = {
    PRODIGI_API_KEY: env.PRODIGI_API_KEY,
    PRINTIFY_API_TOKEN: env.PRINTIFY_API_TOKEN,
    PRINTIFY_SHOP_ID: env.PRINTIFY_SHOP_ID,
    PRINTFUL_API_TOKEN: env.PRINTFUL_API_TOKEN,
    PRINTFUL_STORE_ID: env.PRINTFUL_STORE_ID,
    GELATO_API_KEY: env.GELATO_API_KEY,
    GOOTEN_RECIPE_ID: env.GOOTEN_RECIPE_ID,
  };
  delete fulfillmentEnv.ALLOW_MOCK_DISPATCH;
  return fulfillmentEnv;
}

async function notifyAndRemember(
  env: StripeWebhookEnv,
  notice: DispatchNotice,
  fulfillment: OrderRoutingResult,
  alreadyNotified: boolean
): Promise<boolean> {
  if (alreadyNotified) return true;
  const delivery = await deliverOrderNotifications(env, notice);
  const notified = delivery.operatorSent || delivery.operatorSkipped;
  saveDispatchReceipt({
    sessionId: notice.sessionId,
    notice,
    fulfillment,
    notified,
  });
  return notified;
}

export async function handleStripeWebhook(
  request: Request,
  env: StripeWebhookEnv
): Promise<HandleStripeWebhookResult> {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  const stripeSecret = env.STRIPE_SECRET_KEY?.trim();
  const signature = request.headers.get('stripe-signature');
  const rawBody = await request.text();

  if (!webhookSecret) {
    return {
      status: 503,
      body: { error: 'STRIPE_WEBHOOK_SECRET is not configured' },
    };
  }

  if (!signature) {
    return {
      status: 400,
      body: { error: 'Missing stripe-signature header' },
    };
  }

  const isValid = await verifyWebhookSignature(rawBody, signature, webhookSecret);
  if (!isValid) {
    return {
      status: 400,
      body: { error: 'Invalid webhook signature' },
    };
  }

  let event: { type?: string; data?: { object?: StripeCheckoutSession } };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return {
      status: 400,
      body: { error: 'Invalid webhook payload' },
    };
  }

  if (event.type !== 'checkout.session.completed') {
    return {
      status: 200,
      body: { received: true },
    };
  }

  if (!stripeSecret || stripeSecret.includes('placeholder')) {
    return {
      status: 503,
      body: { error: 'STRIPE_SECRET_KEY is not configured' },
    };
  }

  const session = event.data?.object;
  if (!session?.id) {
    return {
      status: 200,
      body: { received: true, routed: false, error: 'Checkout session payload is incomplete' },
    };
  }

  if (session.payment_status !== 'paid') {
    return {
      status: 200,
      body: { received: true, routed: false, error: 'Checkout session is not paid' },
    };
  }

  if ((session.currency || '').toLowerCase() !== 'usd') {
    return {
      status: 200,
      body: { received: true, routed: false, error: 'Checkout currency must be usd' },
    };
  }

  const existing = readDispatchReceipt(session.id);
  if (existing) {
    await notifyAndRemember(env, existing.notice, existing.fulfillment, existing.notified);
    return {
      status: 200,
      body: {
        received: true,
        routed: true,
        duplicate: true,
        fulfillment: existing.fulfillment,
      },
    };
  }

  const matrix = env.pricingMatrix;
  if (!matrix) {
    return {
      status: 503,
      body: { error: 'Pricing matrix is not configured' },
    };
  }

  const origin = new URL(request.url).origin;
  const publishedSlugs = env.publishedSlugs ?? getPublishedArtworkSlugs();
  const assetConfig = assetConfigFromEnv(env);
  const lineItems = await listSessionLineItems(session.id, stripeSecret);
  const built = orderItemsFromLineItems(
    lineItems,
    origin,
    session.id,
    matrix,
    assetConfig,
    publishedSlugs,
    env.artworkCrops
  );
  if ('error' in built) {
    return {
      status: 200,
      body: { received: true, routed: false, error: built.error },
    };
  }

  const metadataRaw = session.metadata?.items;
  if (metadataRaw) {
    const metadataItems = parseMetadataItems(metadataRaw);
    if (!metadataItems) {
      return {
        status: 200,
        body: { received: true, routed: false, error: 'Fulfillment metadata is invalid' },
      };
    }
    const mismatch = metadataAgrees(metadataItems, built.items);
    if (mismatch) {
      return {
        status: 200,
        body: { received: true, routed: false, error: mismatch },
      };
    }
  }

  const expectedCents = built.items.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0
  );
  if (session.amount_subtotal !== expectedCents || session.amount_total !== expectedCents) {
    return {
      status: 200,
      body: { received: true, routed: false, error: 'Paid total does not match catalog line items' },
    };
  }

  const order = buildOrderFromSession(session, built.items);
  const fulfillment = await routeOrder(order, liveFulfillmentEnv(env));

  if (fulfillment.parcels.some((parcel) => parcel.status === 'mocked')) {
    return {
      status: 200,
      body: {
        received: true,
        routed: false,
        error: 'Mock fulfillment is disabled',
      },
    };
  }

  if (!fulfillment.success) {
    const failureNotice = noticeFromOrder('failure', order, fulfillment);
    await deliverOrderNotifications(env, failureNotice);
    return {
      status: 502,
      body: {
        received: true,
        routed: false,
        fulfillment,
      },
    };
  }

  const notice = noticeFromOrder('dispatch', order, fulfillment);
  saveDispatchReceipt({
    sessionId: session.id,
    notice,
    fulfillment,
    notified: false,
  });
  const notified = await notifyAndRemember(env, notice, fulfillment, false);

  return {
    status: 200,
    body: {
      received: true,
      routed: true,
      notified,
      fulfillment,
    },
  };
}
