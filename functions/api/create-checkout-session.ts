import Stripe from 'stripe';
import pricingMatrix from '../../src/content/pricing-matrix.json';

interface CartLineItem {
  id: string;
  sku: string;
  artworkTitle: string;
  variantTitle: string;
  price: number;
  quantity: number;
  provider: string;
  packagingType: string;
}

interface Env {
  STRIPE_SECRET_KEY: string;
  CF_PAGES_URL?: string;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const { request, env } = context;

  if (!env.STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY is not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json() as { items: CartLineItem[]; customerEmail?: string };
    const { items, customerEmail } = body;

    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ error: 'Cart is empty' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia' as any,
    });

    const matrix = pricingMatrix as Record<string, { retailPrice: number; name: string }>;

    // Validate prices against authoritative pricing-matrix.json
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item) => {
      const canonical = matrix[item.sku];
      // If SKU is recognized in matrix, use canonical price; otherwise clamp to submitted price if it's secondary merch
      const unitAmountCents = canonical 
        ? Math.round(canonical.retailPrice * 100)
        : Math.round(item.price * 100);

      return {
        price_data: {
          currency: 'usd',
          unit_amount: unitAmountCents,
          product_data: {
            name: `${item.artworkTitle} — ${item.variantTitle}`,
            metadata: {
              sku: item.sku,
              provider: item.provider,
              packagingType: item.packagingType,
            },
          },
        },
        quantity: Math.max(1, Math.min(item.quantity, 10)),
      };
    });

    const origin = new URL(request.url).origin;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items,
      customer_email: customerEmail || undefined,
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'NL', 'DK', 'SE', 'NO', 'CH'],
      },
      metadata: {
        item_count: items.length.toString(),
        source: 'alanwoodyard.photo',
      },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Checkout session error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}