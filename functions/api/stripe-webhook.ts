/**
 * functions/api/stripe-webhook.ts
 *
 * Cloudflare Pages Function: Stripe Webhook Listener
 * Verifies Web Crypto HMAC signatures and routes paid orders to the Top 5 POD labs.
 */

import { verifyWebhookSignature } from '../../src/lib/security';
import { routeOrder, type FulfillmentOrder, type FulfillmentEnv } from '../../src/lib/fulfillment';

interface Env extends FulfillmentEnv {
  STRIPE_WEBHOOK_SECRET?: string;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const { request, env } = context;
    const signature = request.headers.get('stripe-signature');
    const rawBody = await request.text();

    const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

    // Signature verification
    if (webhookSecret && signature) {
      const isValid = await verifyWebhookSignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        return new Response(JSON.stringify({ error: 'Invalid webhook signature.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    const event = JSON.parse(rawBody) as {
      type: string;
      data: { object: Record<string, any> };
    };

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      // Map session details to FulfillmentOrder
      const order: FulfillmentOrder = {
        sessionId: session.id,
        orderNumber: `AWP-${session.id.slice(-8).toUpperCase()}`,
        recipient: {
          name: session.customer_details?.name || session.shipping_details?.name || 'Art Patron',
          email: session.customer_details?.email || 'patron@example.com',
          phone: session.customer_details?.phone || '',
          address1: session.shipping_details?.address?.line1 || '',
          address2: session.shipping_details?.address?.line2 || '',
          city: session.shipping_details?.address?.city || '',
          state: session.shipping_details?.address?.state || '',
          postalCode: session.shipping_details?.address?.postal_code || '',
          countryCode: session.shipping_details?.address?.country || 'US'
        },
        items: session.metadata?.items ? JSON.parse(session.metadata.items) : [],
        currency: session.currency?.toUpperCase() || 'USD'
      };

      console.log(`Routing fulfillment for order: ${order.orderNumber}`);
      const fulfillmentResult = await routeOrder(order, env);

      return new Response(
        JSON.stringify({
          received: true,
          routed: true,
          fulfillment: fulfillmentResult
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Webhook error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
