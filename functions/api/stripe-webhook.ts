/**
 * Cloudflare Pages Function: Stripe webhook listener.
 * Fail-closed signature verification; routes paid orders through src/lib/fulfillment.
 */

import pricingMatrix from '../../src/content/pricing-matrix.json';
import type { PricingMatrixEntry } from '../../src/lib/checkout-catalog';
import { handleStripeWebhook, type StripeWebhookEnv } from '../../src/lib/handle-stripe-webhook';

export async function onRequestPost(context: { request: Request; env: StripeWebhookEnv }) {
  try {
    const result = await handleStripeWebhook(context.request, {
      STRIPE_SECRET_KEY: context.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: context.env.STRIPE_WEBHOOK_SECRET,
      PRODIGI_API_KEY: context.env.PRODIGI_API_KEY,
      PRINTIFY_API_TOKEN: context.env.PRINTIFY_API_TOKEN,
      PRINTIFY_SHOP_ID: context.env.PRINTIFY_SHOP_ID,
      PRINTFUL_API_TOKEN: context.env.PRINTFUL_API_TOKEN,
      PRINTFUL_STORE_ID: context.env.PRINTFUL_STORE_ID,
      GELATO_API_KEY: context.env.GELATO_API_KEY,
      GOOTEN_RECIPE_ID: context.env.GOOTEN_RECIPE_ID,
      PRINT_MASTERS_BASE_URL: context.env.PRINT_MASTERS_BASE_URL,
      PRINT_MASTERS_EXTENSION: context.env.PRINT_MASTERS_EXTENSION,
      ALLOW_CLEAN_PREVIEW_ASSETS: context.env.ALLOW_CLEAN_PREVIEW_ASSETS,
      RESEND_API_KEY: context.env.RESEND_API_KEY,
      OPERATOR_EMAIL: context.env.OPERATOR_EMAIL,
      RESEND_FROM: context.env.RESEND_FROM,
      pricingMatrix: pricingMatrix as Record<string, PricingMatrixEntry>,
      // Never pass ALLOW_MOCK_DISPATCH from production webhook path.
    });

    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Webhook error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
