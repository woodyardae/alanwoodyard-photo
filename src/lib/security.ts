/**
 * src/lib/security.ts
 *
 * Checkout Security & Invariant Validations
 * Enforces price authority, item bounds, quantity limits, and HMAC signature verifications.
 */

export interface CartItemInput {
  artworkId: string;
  variantSku: string;
  quantity: number;
}

export interface CatalogVariant {
  sku: string;
  substrate: string;
  substrateName: string;
  size: string;
  lab: string;
  supplierSku: string;
  baseCostUsd: number;
  retailPriceUsd: number;
}

export interface CatalogArtwork {
  id: string;
  slug: string;
  title: string;
  previewImage: string;
  variants: CatalogVariant[];
}

export interface ValidatedLineItem {
  artworkId: string;
  artworkTitle: string;
  slug: string;
  variantSku: string;
  substrate: string;
  substrateName: string;
  size: string;
  quantity: number;
  unitAmountCents: number;
  lab: string;
  supplierSku: string;
  previewImage: string;
}

export interface CartValidationResult {
  valid: boolean;
  error?: string;
  items: ValidatedLineItem[];
  subtotalCents: number;
}

/**
 * Validates untrusted client cart payloads against authoritative catalog
 */
export function validateCartItems(
  rawItems: unknown,
  catalog: CatalogArtwork[]
): CartValidationResult {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { valid: false, error: 'Cart is empty.', items: [], subtotalCents: 0 };
  }

  if (rawItems.length > 20) {
    return { valid: false, error: 'Cart exceeds maximum allowed 20 items.', items: [], subtotalCents: 0 };
  }

  const validated: ValidatedLineItem[] = [];
  let subtotalCents = 0;

  for (const item of rawItems as CartItemInput[]) {
    if (!item || typeof item !== 'object') {
      return { valid: false, error: 'Malformed item structure in cart.', items: [], subtotalCents: 0 };
    }

    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return { valid: false, error: 'Invalid item quantity. Must be between 1 and 20.', items: [], subtotalCents: 0 };
    }

    const artwork = catalog.find(
      (a) => a.id === item.artworkId || a.slug === item.artworkId
    );
    if (!artwork) {
      return { valid: false, error: `Artwork not found in authoritative catalog: ${item.artworkId}`, items: [], subtotalCents: 0 };
    }

    const variant = artwork.variants.find((v) => v.sku === item.variantSku);
    if (!variant) {
      return { valid: false, error: `Invalid variant SKU for artwork "${artwork.title}": ${item.variantSku}`, items: [], subtotalCents: 0 };
    }

    // Authoritative server-side price conversion to cents
    const unitAmountCents = Math.round(variant.retailPriceUsd * 100);
    if (!Number.isSafeInteger(unitAmountCents) || unitAmountCents <= 0) {
      return { valid: false, error: 'Invalid price calculation.', items: [], subtotalCents: 0 };
    }

    subtotalCents += unitAmountCents * quantity;

    validated.push({
      artworkId: artwork.id,
      artworkTitle: artwork.title,
      slug: artwork.slug,
      variantSku: variant.sku,
      substrate: variant.substrate,
      substrateName: variant.substrateName,
      size: variant.size,
      quantity,
      unitAmountCents,
      lab: variant.lab,
      supplierSku: variant.supplierSku,
      previewImage: artwork.previewImage
    });
  }

  return {
    valid: true,
    items: validated,
    subtotalCents
  };
}

/**
 * Web Crypto HMAC-SHA256 signature verification for webhook protection
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = signatureHeader.split(',');
    const timestampPart = parts.find((p) => p.startsWith('t='));
    const sigPart = parts.find((p) => p.startsWith('v1='));

    if (!timestampPart || !sigPart) return false;

    const timestamp = timestampPart.split('=')[1];
    const signature = sigPart.split('=')[1];

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signedPayload = `${timestamp}.${rawBody}`;
    const sigBytes = new Uint8Array(
      signature.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    return await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      encoder.encode(signedPayload)
    );
  } catch {
    return false;
  }
}
