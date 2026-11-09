import type { APIRoute } from 'astro';
import Stripe from 'stripe';
// @ts-ignore
import { env } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const { request } = context;

  const stripeSecret =
    (env as any)?.STRIPE_SECRET_KEY ||
    (import.meta.env as any)?.STRIPE_SECRET_KEY ||
    process.env.STRIPE_SECRET_KEY;

  const webhookSecret =
    (env as any)?.STRIPE_WEBHOOK_SECRET ||
    (import.meta.env as any)?.STRIPE_WEBHOOK_SECRET ||
    process.env.STRIPE_WEBHOOK_SECRET;

  const prodigiKey =
    (env as any)?.PRODIGI_API_KEY ||
    (import.meta.env as any)?.PRODIGI_API_KEY ||
    process.env.PRODIGI_API_KEY;

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
    console.error('[STRIPE WEBHOOK ERROR]', err.message);
    return new Response(JSON.stringify({ error: `Webhook Error: ${err.message}` }), { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const shipping = (session as any).shipping_details || session.customer_details;
    const email = session.customer_details?.email || '';

    // Retrieve full line items from Stripe session
    const lineItemsRes = await stripe.checkout.sessions.listLineItems(session.id, {
      expand: ['data.price.product'],
    });

    const prodigiItems: any[] = [];
    const origin = new URL(request.url).origin;

    for (const item of lineItemsRes.data) {
      const product = item.price?.product as Stripe.Product | undefined;
      const meta = product?.metadata || {};
      const provider = meta.provider || 'prodigi';

      if (provider === 'prodigi') {
        const sku = meta.sku || 'GLOBAL-FAP-16x24';
        const artworkSlug = meta.artworkSlug || '';
        const printAssetUrl = `${origin}/images/artworks/clean/${artworkSlug}.webp`;

        prodigiItems.push({
          merchantReference: `${session.id}-${sku}`,
          sku,
          copies: item.quantity || 1,
          sizing: 'fillPrintArea',
          assets: [
            {
              printArea: 'default',
              url: printAssetUrl,
            },
          ],
        });
      }
    }

    // Submit directly to Prodigi Production API
    if (prodigiItems.length > 0 && prodigiKey) {
      try {
        const prodigiPayload = {
          shippingMethod: 'Budget',
          recipient: {
            name: shipping?.name || 'Art Collector',
            email,
            address: {
              line1: shipping?.address?.line1 || '',
              line2: shipping?.address?.line2 || '',
              postalOrZipCode: shipping?.address?.postal_code || '',
              townOrCity: shipping?.address?.city || '',
              stateOrCounty: shipping?.address?.state || '',
              countryCode: shipping?.address?.country || 'US',
            },
          },
          items: prodigiItems,
          metadata: {
            stripeSessionId: session.id,
            store: 'alanwoodyard.photo',
          },
        };

        const prodigiRes = await fetch('https://api.prodigi.com/v4.0/Orders', {
          method: 'POST',
          headers: {
            'X-API-Key': prodigiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(prodigiPayload),
        });

        const prodigiData = await prodigiRes.json();
        console.log(`[PRODIGI ORDER DISPATCHED] Status: ${prodigiRes.status}`, prodigiData);
      } catch (err: any) {
        console.error('[PRODIGI ORDER ERROR]', err.message);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};