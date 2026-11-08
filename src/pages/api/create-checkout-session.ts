import type { APIRoute } from 'astro';
import Stripe from 'stripe';
// @ts-ignore
import { env } from 'cloudflare:workers';
import pricingMatrix from '../../content/pricing-matrix.json';

export const prerender = false;

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

export const POST: APIRoute = async (context) => {
  const { request } = context;

  try {
    const body = (await request.json()) as { items: CartLineItem[]; customerEmail?: string };
    const { items, customerEmail } = body;

    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ error: 'Cart is empty' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const stripeKey =
      (env as any)?.STRIPE_SECRET_KEY ||
      (import.meta.env as any)?.STRIPE_SECRET_KEY ||
      process.env.STRIPE_SECRET_KEY;

    const stripePublic =
      (env as any)?.STRIPE_PUBLIC_KEY ||
      (import.meta.env as any)?.STRIPE_PUBLIC_KEY ||
      process.env.STRIPE_PUBLIC_KEY;

    if (!stripeKey || stripeKey.includes('placeholder')) {
      return new Response(
        JSON.stringify({
          returnUrl: '/order-confirmation?session_id=cs_test_simulated_' + Date.now(),
          simulated: true,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2024-12-18.acacia' as any,
    });

    const matrix = pricingMatrix as Record<string, { retailPrice: number }>;

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item) => {
      const canonical = matrix[item.sku];
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
      ui_mode: 'embedded',
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
      return_url: `${origin}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
    });

    return new Response(
      JSON.stringify({
        clientSecret: session.client_secret,
        publishableKey: stripePublic,
        simulated: false,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    console.error('[CHECKOUT ERROR]', err);
    return new Response(JSON.stringify({ error: err.message || 'Checkout session error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};