/**
 * functions/api/create-checkout-session.ts
 *
 * Cloudflare Pages Function: Create Stripe Checkout Session
 * - Validates cart line items with server price authority
 * - Calculates discrete split-cart multi-package shipping fees
 * - Attaches multi-lab fulfillment metadata for webhook processing
 */

import { validateCartItems } from '../../src/lib/security';
import { calculateSplitCartShipping, type OrderItem, type PodLab } from '../../src/lib/fulfillment';

interface Env {
  STRIPE_SECRET_KEY?: string;
  ALLOW_MOCK_CHECKOUT?: string;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const { request, env } = context;
    const requestUrl = new URL(request.url);
    const origin = requestUrl.origin;

    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    };

    // 1. Parse cart payload
    const body = (await request.json()) as { items?: unknown };
    const rawItems = body.items;

    // 2. Fetch authoritative catalog from local endpoint/asset
    const catalogRes = await fetch(`${origin}/data/artworks.json`);
    let catalog = [];
    if (catalogRes.ok) {
      catalog = await catalogRes.json();
    } else {
      // Fallback: If static JSON is being requested during SSG preview
      console.warn('Could not load /data/artworks.json; checking catalog array');
    }

    // 3. Server-side validation of prices and variant SKUs
    const validation = validateCartItems(rawItems, catalog);
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const validatedItems = validation.items;

    // 4. Calculate split-cart multi-package shipping
    const fulfillmentItems: OrderItem[] = validatedItems.map((v) => ({
      id: v.variantSku,
      sku: v.variantSku,
      artworkId: v.artworkId,
      artworkTitle: v.artworkTitle,
      substrate: v.substrate as any,
      size: v.size,
      quantity: v.quantity,
      unitPriceCents: v.unitAmountCents,
      lab: v.lab as PodLab,
      supplierSku: v.supplierSku,
      printAssetUrl: `${origin}${v.previewImage}`
    }));

    const shippingResult = calculateSplitCartShipping(fulfillmentItems, 'US');

    // 5. Handle mock or unconfigured Stripe
    const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.includes('placeholder')) {
      const mockSessionId = `cs_mock_awp_${Date.now()}`;
      return new Response(
        JSON.stringify({
          url: `${origin}/#checkout-success?session_id=${mockSessionId}`,
          sessionId: mockSessionId,
          mock: true,
          splitCartShipping: shippingResult
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 6. Construct Stripe Checkout Session Form Parameters
    const stripeParams = new URLSearchParams();
    stripeParams.append('payment_method_types[0]', 'card');
    stripeParams.append('mode', 'payment');
    stripeParams.append('success_url', `${origin}/#checkout-success?session_id={CHECKOUT_SESSION_ID}`);
    stripeParams.append('cancel_url', `${origin}/#checkout-cancel`);
    stripeParams.append('shipping_address_collection[allowed_countries][0]', 'US');
    stripeParams.append('shipping_address_collection[allowed_countries][1]', 'CA');

    // Line items
    validatedItems.forEach((item, index) => {
      stripeParams.append(`line_items[${index}][price_data][currency]`, 'usd');
      stripeParams.append(`line_items[${index}][price_data][product_data][name]`, `${item.artworkTitle} — ${item.substrateName} (${item.size})`);
      stripeParams.append(`line_items[${index}][price_data][product_data][images][0]`, `${origin}${item.previewImage}`);
      stripeParams.append(`line_items[${index}][price_data][unit_amount]`, String(item.unitAmountCents));
      stripeParams.append(`line_items[${index}][quantity]`, String(item.quantity));
    });

    // Add shipping options based on split-cart calculations
    stripeParams.append('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
    stripeParams.append('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(shippingResult.totalShippingCents));
    stripeParams.append('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'usd');
    stripeParams.append('shipping_options[0][shipping_rate_data][display_name]', shippingResult.isMultiVendor ? `Split-Facility Shipping (${shippingResult.vendorCount} Specialized Labs)` : 'Fine-Art Archival Parcel');

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: stripeParams.toString()
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Stripe API error HTTP ${res.status}: ${err}`);
    }

    const session = (await res.json()) as { url: string; id: string };
    return new Response(
      JSON.stringify({
        url: session.url,
        sessionId: session.id,
        splitCartShipping: shippingResult
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Checkout session creation failed.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
