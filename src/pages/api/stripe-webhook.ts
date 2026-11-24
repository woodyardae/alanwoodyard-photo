import type { APIRoute } from 'astro';
// @ts-ignore
import { env } from 'cloudflare:workers';
import pricingMatrix from '../../content/pricing-matrix.json';
import type { PricingMatrixEntry } from '../../lib/checkout-catalog';
import { handleStripeWebhook } from '../../lib/handle-stripe-webhook';

export const prerender = false;

/** Astro SSR twin of functions/api/stripe-webhook.ts. Fail-closed via handleStripeWebhook. */

function readEnv(key: string): string | undefined {
  return (
    (env as Record<string, string | undefined>)?.[key] ||
    (import.meta.env as Record<string, string | undefined>)?.[key] ||
    process.env[key]
  );
}

function readSessionKv() {
  // @ts-ignore cloudflare:workers binding is absent in local Node and tests.
  return (env as { SESSION?: { get: (key: string) => Promise<string | null>; put: (key: string, value: string) => Promise<void> } } | undefined)?.SESSION;
}

export const POST: APIRoute = async (context) => {
  const { request } = context;

  try {
    const result = await handleStripeWebhook(request, {
      STRIPE_SECRET_KEY: readEnv('STRIPE_SECRET_KEY'),
      STRIPE_WEBHOOK_SECRET: readEnv('STRIPE_WEBHOOK_SECRET'),
      PRODIGI_API_KEY: readEnv('PRODIGI_API_KEY'),
      PRINTIFY_API_TOKEN: readEnv('PRINTIFY_API_TOKEN'),
      PRINTIFY_SHOP_ID: readEnv('PRINTIFY_SHOP_ID'),
      PRINTFUL_API_TOKEN: readEnv('PRINTFUL_API_TOKEN'),
      PRINTFUL_STORE_ID: readEnv('PRINTFUL_STORE_ID'),
      GELATO_API_KEY: readEnv('GELATO_API_KEY'),
      GOOTEN_RECIPE_ID: readEnv('GOOTEN_RECIPE_ID'),
      PRINT_MASTERS_BASE_URL: readEnv('PRINT_MASTERS_BASE_URL'),
      PRINT_MASTERS_EXTENSION: readEnv('PRINT_MASTERS_EXTENSION'),
      ALLOW_CLEAN_PREVIEW_ASSETS: readEnv('ALLOW_CLEAN_PREVIEW_ASSETS'),
      TELEGRAM_BOT_TOKEN: readEnv('TELEGRAM_BOT_TOKEN'),
      TELEGRAM_CHAT_ID: readEnv('TELEGRAM_CHAT_ID'),
      pricingMatrix: pricingMatrix as Record<string, PricingMatrixEntry>,
      SESSION: readSessionKv(),
      // Never pass ALLOW_MOCK_DISPATCH from production webhook path.
    });

    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Webhook error';
    console.error('[STRIPE WEBHOOK ERROR]', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
