import { verifyStripeSignature } from '../../../../packages/pod-fulfillment-router/crypto/stripe-signature.js';
import { routeAndFulfillOrder } from '../../../../packages/pod-fulfillment-router/router.js';

export async function onRequestPost({ request, env }) {
  const signature = request.headers.get('stripe-signature');
  const secret = env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return new Response(JSON.stringify({ error: 'Missing signature or webhook secret' }), { status: 400 });
  }

  const rawBody = await request.text();
  const isValid = await verifyStripeSignature(rawBody, signature, secret);

  if (!isValid) {
    return new Response(JSON.stringify({ error: 'Invalid HMAC signature' }), { status: 400 });
  }

  const event = JSON.parse(rawBody);

  if (event.type === 'checkout.session.completed') {
    try {
      const outcome = await routeAndFulfillOrder(event.data.object, env);
      return new Response(JSON.stringify({ status: 'processed', outcome }), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}