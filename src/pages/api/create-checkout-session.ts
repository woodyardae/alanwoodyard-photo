import type { APIRoute } from 'astro';
// @ts-ignore
import { env } from 'cloudflare:workers';
import pricingMatrix from '../../content/pricing-matrix.json';
import { parseAllowedCountriesConfig, parseEnabledVendorsConfig } from '../../lib/checkout-catalog';
import {
  createEmbeddedCheckoutSession,
  type CheckoutCartItem,
  type PricingMatrixEntry,
} from '../../lib/create-checkout-session';

export const prerender = false;

function readEnv(key: string): string | undefined {
  return (
    (env as Record<string, string | undefined>)?.[key] ||
    (import.meta.env as Record<string, string | undefined>)?.[key] ||
    process.env[key]
  );
}

export const POST: APIRoute = async (context) => {
  const { request } = context;

  try {
    const body = (await request.json()) as {
      items: CheckoutCartItem[];
      customerEmail?: string;
      nonce?: string;
    };

    const result = await createEmbeddedCheckoutSession({
      items: body.items,
      customerEmail: body.customerEmail,
      origin: new URL(request.url).origin,
      stripeSecretKey: readEnv('STRIPE_SECRET_KEY'),
      stripePublishableKey: readEnv('STRIPE_PUBLIC_KEY') || readEnv('STRIPE_PUBLISHABLE_KEY'),
      pricingMatrix: pricingMatrix as Record<string, PricingMatrixEntry>,
      allowSimulatedCheckout: readEnv('ALLOW_SIMULATED_CHECKOUT') === '1',
      printMastersBaseUrl: readEnv('PRINT_MASTERS_BASE_URL'),
      printMastersExtension: readEnv('PRINT_MASTERS_EXTENSION'),
      allowCleanPreviewAssets: readEnv('ALLOW_CLEAN_PREVIEW_ASSETS') === '1',
      enabledVendors: parseEnabledVendorsConfig(readEnv('CHECKOUT_ENABLED_VENDORS')),
      allowedCountries: parseAllowedCountriesConfig(readEnv('CHECKOUT_ALLOWED_COUNTRIES')),
      attemptNonce: body.nonce,
    });

    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Checkout session error';
    console.error('[CHECKOUT ERROR]', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
