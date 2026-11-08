import type { APIRoute } from 'astro';
import Stripe from 'stripe';
// @ts-ignore
import { env } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const stripeSecret =
    (env as any)?.STRIPE_SECRET_KEY ||
    (import.meta.env as any)?.STRIPE_SECRET_KEY ||
    process.env.STRIPE_SECRET_KEY;

  const webhookSecret =
    (env as any)?.STRIPE_WEBHOOK_SECRET ||
    (import.meta.env as any)?.STRIPE_WEBHOOK_SECRET ||
    process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecret) {
    return new Response(JSON.stringify({ error: 'Missing Stripe Secret Key' }), { status: 500 });
  }

  const stripe = new Stripe(stripeSecret, {
    apiVersion: '2024-12-18.acacia' as any,
  });

  const sig = request.headers.get('stripe-signature');
  const payload = await request.text();

  let event: Stripe.Event;

  try {
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
    } else {
      event = JSON.parse(payload) as Stripe.Event;
    }
  } catch (err: any) {
    console.error('[STRIPE WEBHOOK SIGNATURE FAILURE]', err.message);
    return new Response(JSON.stringify({ error: `Webhook Error: ${err.message}` }), { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const customerEmail = session.customer_details?.email;
    const shippingDetails = (session as any).shipping_details || session.customer_details;
    const orderTotalCents = session.amount_total;

    console.log('[ORDER PAID]', session.id, customerEmail, orderTotalCents);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};